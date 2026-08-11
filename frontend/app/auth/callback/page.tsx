import CallbackHandler from "./callback-handler";

export default async function AuthCallbackPage(props: PageProps<"/auth/callback">) {
  const searchParams = await props.searchParams;
  const token = typeof searchParams.token === "string" ? searchParams.token : null;

  return <CallbackHandler token={token} />;
}
