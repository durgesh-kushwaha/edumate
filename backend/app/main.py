import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.endpoints import auth, admin, teacher, student, attendance
from app.core.config import settings
from app.db.session import engine, Base

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.middleware('http')
async def log_requests(request: Request, call_next):
    logger.info('Request: %s %s', request.method, request.url.path)
    response = await call_next(request)
    return response


@app.exception_handler(Exception)
async def global_exception_handler(_: Request, exc: Exception):
    logger.exception('Unhandled exception: %s', exc)
    return JSONResponse(status_code=500, content={'error': {'code': 'INTERNAL_ERROR', 'message': 'Something went wrong'}})


app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(admin.router, prefix=settings.API_V1_PREFIX)
app.include_router(teacher.router, prefix=settings.API_V1_PREFIX)
app.include_router(student.router, prefix=settings.API_V1_PREFIX)
app.include_router(attendance.router, prefix=settings.API_V1_PREFIX)


@app.get('/health')
def health_check():
    return {'status': 'ok'}
