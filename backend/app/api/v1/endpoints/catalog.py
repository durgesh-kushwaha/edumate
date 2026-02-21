import httpx
from fastapi import APIRouter, HTTPException

from app.core.catalog import DEPARTMENT_CATALOG, PINCODE_FALLBACK

router = APIRouter(prefix='/catalog', tags=['Catalog'])


@router.get('/departments')
def list_departments():
    return DEPARTMENT_CATALOG


@router.get('/pincode/{pincode}')
async def lookup_pincode(pincode: str):
    if not pincode.isdigit() or len(pincode) != 6:
        raise HTTPException(status_code=400, detail='Pincode must be 6 digits')

    fallback = PINCODE_FALLBACK.get(pincode)
    if fallback:
        return {'pincode': pincode, **fallback, 'source': 'fallback'}

    url = f'https://api.postalpincode.in/pincode/{pincode}'
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
        response.raise_for_status()
        payload = response.json()
        if not payload or payload[0].get('Status') != 'Success':
            raise HTTPException(status_code=404, detail='Pincode details not found')
        post_offices = payload[0].get('PostOffice') or []
        if not post_offices:
            raise HTTPException(status_code=404, detail='Pincode details not found')
        first = post_offices[0]
        return {
            'pincode': pincode,
            'state': first.get('State') or '',
            'city': first.get('District') or '',
            'source': 'india-post',
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Pincode service unavailable')
