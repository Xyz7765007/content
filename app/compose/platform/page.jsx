import { redirect } from "next/navigation";

// The three step wizard is one page now. Old links land there.
export default function ComposeStepRedirect() {
  redirect("/compose");
}
