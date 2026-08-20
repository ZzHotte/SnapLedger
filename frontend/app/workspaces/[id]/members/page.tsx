import MembersPageClient from "./members-client";

export default async function WorkspaceMembersPage(props: PageProps<"/workspaces/[id]/members">) {
  const { id } = await props.params;
  return <MembersPageClient workspaceId={Number(id)} />;
}
