import CustomerDetailClient from "./customer-detail-client";

export default async function CustomerDetailPage(props: PageProps<"/customers/[id]">) {
  const { id } = await props.params;
  return <CustomerDetailClient customerId={Number(id)} />;
}
