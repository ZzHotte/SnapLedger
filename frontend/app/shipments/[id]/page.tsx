import ShipmentDetailClient from "./shipment-detail-client";

export default async function ShipmentDetailPage(props: PageProps<"/shipments/[id]">) {
  const { id } = await props.params;
  return <ShipmentDetailClient shipmentId={Number(id)} />;
}
