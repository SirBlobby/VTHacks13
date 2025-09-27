import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "DC Heatmap Explorer — Washington, D.C. Density Visualizer",
	description:
		"Interactive heatmap of simulated points across Washington, D.C. Toggle heatmap, inspect nearby statistics, and explore data-driven areas.",
	openGraph: {
		title: "DC Heatmap Explorer — Washington, D.C.",
		description:
			"Interactive heatmap of simulated points across Washington, D.C.",
		url: "https://your-domain.example/",
		siteName: "DC Heatmap Explorer",
		images: [
			{
				url: "https://your-domain.example/og-image.png",
				width: 1200,
				height: 630,
				alt: "DC Heatmap Explorer preview",
			},
		],
		locale: "en_US",
		type: "website",
	}
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" data-theme="cerberus">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				{children}
			</body>
		</html>
	);
}
