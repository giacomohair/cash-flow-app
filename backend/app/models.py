from sqlalchemy import Column, Integer, String, DateTime, func, ForeignKey, Text
from sqlalchemy.orm import relationship
from .database import Base
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    models = relationship("ForecastModel", back_populates="user", cascade="all,delete")
class ForecastModel(Base):
    __tablename__ = "forecast_models"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, default="default")
    data = Column(Text, nullable=False)
    settings = Column(Text, nullable=False, default='{}')
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    user = relationship("User", back_populates="models")
