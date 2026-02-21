import { PINCODE_FALLBACK } from '@/lib/catalog';
import { jsonError, jsonOk } from '@/lib/http';

export async function GET(_: Request, { params }: { params: Promise<{ pincode: string }> }) {
  const { pincode } = await params;
  if (!/^\d{6}$/.test(pincode)) {
    return jsonError('Pincode must be 6 digits', 400);
  }

  if (PINCODE_FALLBACK[pincode]) {
    return jsonOk({ pincode, ...PINCODE_FALLBACK[pincode], source: 'fallback' });
  }

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const payload = (await response.json()) as Array<{
      Status?: string;
      PostOffice?: Array<{ State?: string; District?: string }>;
    }>;
    if (!payload?.length || payload[0]?.Status !== 'Success') {
      return jsonError('Pincode details not found', 404);
    }
    const first = payload[0]?.PostOffice?.[0];
    if (!first) {
      return jsonError('Pincode details not found', 404);
    }
    return jsonOk({
      pincode,
      state: first.State || '',
      city: first.District || '',
      source: 'india-post',
    });
  } catch {
    return jsonError('Pincode service unavailable', 503);
  }
}
