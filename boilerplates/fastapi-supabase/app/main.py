import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

app = FastAPI(title="sh1pt · fastapi + supabase")
_supabase: Client | None = None


def supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase


class WaitlistSignup(BaseModel):
    email: EmailStr
    handle: str | None = None
    referred_by: str | None = None


@app.get("/")
def root() -> dict:
    return {"name": "sh1pt-fastapi-supabase", "version": "0.1.0"}


@app.get("/me")
def me(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.removeprefix("Bearer ")
    result = supabase().auth.get_user(token)
    if result.user is None:
        raise HTTPException(status_code=401, detail="invalid token")
    return {"user": result.user.model_dump()}


@app.post("/waitlist")
def waitlist(signup: WaitlistSignup) -> dict:
    # Recipe: waitlist-crypto-investor — mint a referral code per signup
    code = os.urandom(4).hex()
    supabase().table("waitlist").insert({
        "email": signup.email,
        "handle": signup.handle,
        "referred_by": signup.referred_by,
        "referral_code": code,
    }).execute()
    return {"referral_code": code}
