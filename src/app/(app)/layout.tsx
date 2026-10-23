import { AppHeader } from "@/components/layout/app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <AppHeader />
      <div id="conteudo" className="flex flex-1 flex-col pb-14 md:pb-0">
        {children}
      </div>
    </>
  );
}
