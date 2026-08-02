export const PAY_BASE_URL = "https://mamanay.vercel.app";

export function payOrderLink(orderId: string): string {
  return `${PAY_BASE_URL}/pay/${orderId}`;
}

export function payGroupLink(orderIds: string[]): string {
  return `${PAY_BASE_URL}/pay?orders=${orderIds.join(",")}`;
}
