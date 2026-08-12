import MembersPageClient from "./members-client";

export default async function LedgerMembersPage(props: PageProps<"/ledgers/[id]/members">) {
  const { id } = await props.params;
  return <MembersPageClient ledgerId={Number(id)} />;
}
