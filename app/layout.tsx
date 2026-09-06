import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: {
    default: "Калькулятор GPU-инфраструктуры",
    template: "%s · GPU-калькулятор",
  },
  description:
    "Подбор моделей, GPU и сравнение стоимости аренды и покупки для корпоративных задач ИИ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
