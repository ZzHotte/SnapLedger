import AcceptInviteClient from "./accept-invite-client";

export default async function AcceptInvitePage(props: PageProps<"/invites/[code]">) {
  const { code } = await props.params;
  return <AcceptInviteClient code={code} />;
}
