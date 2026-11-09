import { ResetPasswordForm } from "../password-reset";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  return (
    <ResetPasswordForm token={typeof token === "string" ? token : null} invalid={Boolean(error)} />
  );
}
