'use client';

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

import {
  SidebarBrand,
  SidebarNavList,
  SidebarUserFooter,
} from '@/components/layout/app-sidebar';

type MobileSidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
};

export function MobileSidebar({ open, onOpenChange, onLogout }: MobileSidebarProps) {
  const handleNavigate = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[280px] flex-col bg-[#111318] p-0 text-white sm:max-w-[280px]"
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <div className="border-b border-white/10 px-4 py-4">
          <SidebarBrand />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-2 py-3">
          <SidebarNavList onNavigate={handleNavigate} />
          <SidebarUserFooter onLogout={onLogout} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
