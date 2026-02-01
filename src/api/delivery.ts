import { apiClient } from './client.js';
import type { DeliverySlip, CreateDeliverySlipFromQuoteParams } from '../types/index.js';

export async function createDeliverySlipFromQuote(
  params: CreateDeliverySlipFromQuoteParams
): Promise<DeliverySlip> {
  return apiClient.post<DeliverySlip>('/delivery_slips/from_quote', {
    quote_id: params.quote_id,
    delivery_date: params.delivery_date,
    title: params.title,
    memo: params.memo,
  });
}
