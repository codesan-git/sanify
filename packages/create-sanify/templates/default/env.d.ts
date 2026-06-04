// Tipe fitur dev Bun: import file .html & HMR (import.meta.hot).

declare module "*.html" {
  const content: import("bun").HTMLBundle;
  export default content;
}

interface ImportMeta {
  hot?: {
    accept(callback?: (module: unknown) => void): void;
    dispose(callback: (data: unknown) => void): void;
    data: unknown;
  };
}
