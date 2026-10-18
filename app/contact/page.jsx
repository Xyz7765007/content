import { Suspense } from "react";
import ContactSection from "../../components/landing/ContactSection";
import { SiteNav, SiteFooter } from "../../components/site/SiteChrome";
import JoinSheet from "../../components/site/JoinSheet";

export const metadata = {
  title: "Contact",
  description: "A question, a brand to set up, or something you wish Huesy did. Write to us.",
};

export default function ContactPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SiteNav />
      <main id="main" className="relative overflow-hidden py-12 lg:py-20">
        <div className="aurora aurora-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
        <div className="relative">
          <ContactSection standalone />
        </div>
      </main>
      <SiteFooter />
      <Suspense fallback={null}>
        <JoinSheet />
      </Suspense>
    </div>
  );
}
