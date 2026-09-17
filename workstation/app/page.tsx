import { RecruiterWorkstation } from "@/components/workstation/recruiter-workstation";
import { requireChatGPTUser } from "./chatgpt-auth";

export default async function Home() {
  const user = await requireChatGPTUser("/");

  return (
    <RecruiterWorkstation
      user={{ id: user.userId, displayName: user.displayName }}
    />
  );
}
