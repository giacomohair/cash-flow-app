from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import os, json

from .database import Base, engine, get_db
from .models import User, ForecastModel
from .auth import hash_password, verify_password, create_access_token, get_current_user_id
from .services import demo, materialize, render_html, weeks_from_dates

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cash‑Flow Forecaster API")

origins = os.getenv("CORS_ORIGINS","http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# auth
@app.post("/api/auth/register")
def register(body: dict, db: Session = Depends(get_db)):
    email = (body.get("email","") or "").strip().lower()
    pw = body.get("password","") or ""
    if not email or not pw: raise HTTPException(400,"Email and password required")
    if db.query(User).filter(User.email==email).first(): raise HTTPException(400,"Email already registered")
    u = User(email=email, password_hash=hash_password(pw)); db.add(u); db.commit(); db.refresh(u)
    return {"access_token": create_access_token(str(u.id)), "token_type":"bearer"}

@app.post("/api/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = (form.username or "").strip().lower()
    u = db.query(User).filter(User.email==email).first()
    if not u or not verify_password(form.password, u.password_hash): raise HTTPException(400,"Invalid credentials")
    return {"access_token": create_access_token(str(u.id)), "token_type":"bearer"}

def get_or_create_model(db:Session, user_id:int)->ForecastModel:
    fm = db.query(ForecastModel).filter(ForecastModel.user_id==user_id, ForecastModel.name=="default").first()
    if not fm:
        data = demo(); materialize(data)
        fm = ForecastModel(user_id=user_id, name="default", data=json.dumps(data), settings=json.dumps({"gran":"MONTH","collapse":False,"alert":0,"dates":{}}))
        db.add(fm); db.commit(); db.refresh(fm)
    return fm

@app.get("/api/settings")
def get_settings(user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    return json.loads(fm.settings or "{}")

@app.post("/api/settings")
def update_settings(body:dict, user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    s = json.loads(fm.settings or "{}")
    s.update({k:v for k,v in body.items() if k in ("gran","collapse","alert","dates")})
    fm.settings = json.dumps(s); db.commit()
    return {"ok":True}

@app.get("/api/view/render")
def render_view(user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    data = json.loads(fm.data); settings = json.loads(fm.settings or "{}")
    html = render_html(data, settings)
    return {"html": html, "settings": settings}

from pydantic import BaseModel
class CellEdit(BaseModel):
    section: str  # positives|negatives
    row_id: str
    week_id: str
    value: float

@app.post("/api/cell/edit")
def edit_cell(edit:CellEdit, user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    data = json.loads(fm.data)
    group = data.get(edit.section)
    if not group: raise HTTPException(400,"Invalid section")
    row = next((r for r in group if r["id"]==edit.row_id), None)
    if not row: raise HTTPException(404,"Row not found")
    v = float(edit.value)
    # keep outflows negative EXCEPT for Adjustment rows which allow both signs
    if row["type"]=="OUTFLOW" and not row.get("isAdjustment") and v>0:
        v = -v
    row["values"][edit.week_id]=v
    materialize(data)
    fm.data=json.dumps(data); db.commit()
    return {"ok":True}

class AddItem(BaseModel):
    section: str
    name: str
    type: str  # INFLOW|OUTFLOW
    amount: float = 0.0
    recur_kind: str | None = None
    every: int | None = 1

@app.post("/api/items/add")
def add_item(body: AddItem, user_id: int = Depends(get_current_user_id), db: Session = Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    data = json.loads(fm.data)
    if body.section not in ("positives", "negatives"):
        raise HTTPException(400, "Invalid section")
    weeks = data["weeks"]
    values = {w["id"]: 0 for w in weeks}

    item = {
        "id": f"row{len(data[body.section]) + 1}",
        "name": body.name,
        "type": body.type,
        "values": values,
    }

    if body.recur_kind:
        amt = body.amount if body.type == "INFLOW" else -abs(body.amount)
        item["recur"] = {
            "kind": body.recur_kind,
            "every": body.every or 1,
            "amount": amt,
        }

    data[body.section].append(item)
    materialize(data)
    fm.data = json.dumps(data)
    db.commit()
    return {"ok": True}

class DelItem(BaseModel):
    section: str
    row_id: str
@app.post("/api/items/delete")
def delete_item(body:DelItem, user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    data = json.loads(fm.data)
    if body.section not in ("positives","negatives"): raise HTTPException(400,"Invalid section")
    data[body.section] = [r for r in data[body.section] if r["id"]!=body.row_id]
    materialize(data)
    fm.data=json.dumps(data); db.commit(); return {"ok":True}

class SetRecur(BaseModel):
    section: str
    row_id: str
    amount: float
    recur_kind: str
    every: int | None = 1
@app.post("/api/items/recurrence")
def set_recurrence(body:SetRecur, user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    data = json.loads(fm.data)
    if body.section not in ("positives","negatives"): raise HTTPException(400,"Invalid section")
    row = next((r for r in data[body.section] if r["id"]==body.row_id), None)
    if not row: raise HTTPException(404,"Row not found")
    amt = body.amount if row["type"]=="INFLOW" else -abs(body.amount)
    row["recur"]={"kind":body.recur_kind,"every":body.every or 1,"amount":amt}
    # clear existing values so recurrence fully rematerializes
    for wid in row["values"].keys():
        row["values"][wid]=0
    materialize(data)
    fm.data=json.dumps(data); db.commit(); return {"ok":True}

class ApplyDates(BaseModel):
    start: str
    end: str
@app.post("/api/dates/apply")
def apply_dates(body:ApplyDates, user_id:int=Depends(get_current_user_id), db:Session=Depends(get_db)):
    fm = get_or_create_model(db, user_id)
    data = json.loads(fm.data)
    new_weeks = weeks_from_dates(body.start, body.end)
    def remap(r):
        r["values"]={w["id"]:0 for w in new_weeks}; return r
    data["weeks"]=new_weeks
    data["positives"]=[remap(r) for r in data["positives"]]
    data["negatives"]=[remap(r) for r in data["negatives"]]
    materialize(data)
    fm.data=json.dumps(data)
    s = json.loads(fm.settings or "{}"); s["dates"]={"start":body.start,"end":body.end}; fm.settings=json.dumps(s)
    db.commit(); return {"ok":True}