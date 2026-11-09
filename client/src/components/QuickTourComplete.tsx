import { ArrowRight, Download, ExternalLink, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ASSET_URLS } from "@/lib/gameData";
import { trackEvent } from "@/lib/analytics";
import {
  FEATURED_WORKSHOP_PROJECT_IDS,
  WORKSHOP_PROJECTS,
} from "@/lib/workshopData";

interface QuickTourCompleteProps {
  onClose: () => void;
  onContactClick: () => void;
}

export default function QuickTourComplete({
  onClose,
  onContactClick,
}: QuickTourCompleteProps) {
  const featuredProject = WORKSHOP_PROJECTS.find(
    project => project.id === FEATURED_WORKSHOP_PROJECT_IDS[0]
  );

  if (!featuredProject?.demoUrl) return null;

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-xl border-4 border-emerald-800 bg-[#faf6ee] p-6 sm:p-8"
        showCloseButton={false}
      >
        <DialogHeader className="text-center">
          <DialogTitle className="pixel-text text-center text-emerald-800 text-[11px] sm:text-sm leading-relaxed">
            QUICK HIGHLIGHTS COMPLETE
          </DialogTitle>
          <DialogDescription
            className="mx-auto max-w-md text-center text-sm leading-relaxed text-[#4a4540]"
            style={{ fontFamily: "'Nunito', sans-serif" }}
          >
            You have met Marcus through his work at Meta, his AI practice and
            the Workshop. Choose a next step, or keep exploring whenever you
            like.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={onContactClick}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{
              background: "#2D5016",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <Mail size={15} />
            CONTACT MARCUS
          </button>
          <a
            href={ASSET_URLS.resumePdf}
            download="Marcus-Tay-Resume.pdf"
            onClick={() => trackEvent("resume_download")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 py-3 text-center text-xs font-bold text-white no-underline transition-opacity hover:opacity-90"
            style={{
              background: "#1565C0",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <Download size={15} />
            DOWNLOAD RÉSUMÉ
          </a>
          <a
            href={featuredProject.demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent("project_demo_click", { project: featuredProject.id })
            }
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 py-3 text-center text-xs font-bold text-white no-underline transition-opacity hover:opacity-90"
            style={{
              background: "#8F5A28",
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            <ExternalLink size={15} />
            TRY {featuredProject.name.toUpperCase()}
          </a>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mx-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-emerald-900 transition-colors hover:bg-emerald-900/10"
          style={{ fontFamily: "'Nunito', sans-serif" }}
        >
          Full exploration is optional — keep exploring the map
          <ArrowRight size={14} />
        </button>
      </DialogContent>
    </Dialog>
  );
}
