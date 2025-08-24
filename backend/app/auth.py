import os, datetime, jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
SECRET_KEY = os.getenv("SECRET_KEY","dev-secret-change-me")
ALGO = "HS256"
ACCESS_MIN = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES","10080"))
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
def hash_password(p:str)->str: return pwd.hash(p)
def verify_password(p:str,h:str|None)->bool: return bool(h) and pwd.verify(p,h)
def create_access_token(sub:str)->str:
    import datetime as dt
    return jwt.encode({"sub":sub,"exp":dt.datetime.utcnow()+dt.timedelta(minutes=ACCESS_MIN)}, SECRET_KEY, algorithm=ALGO)
def decode_token(t:str)->dict:
    try: return jwt.decode(t, SECRET_KEY, algorithms=[ALGO])
    except jwt.PyJWTError: raise HTTPException(401,"Invalid token")
def get_current_user_id(token:str=Depends(oauth))->int:
    sub = decode_token(token).get("sub"); 
    if not sub: raise HTTPException(401,"Invalid token payload")
    return int(sub)
