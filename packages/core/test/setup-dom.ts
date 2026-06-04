// setup-dom.ts — registrasi happy-dom sekali untuk semua test yang butuh DOM
import { GlobalRegistrator } from "@happy-dom/global-registrator";

try {
  GlobalRegistrator.register({ url: "http://localhost:3000/" });
} catch {
  /* sudah terdaftar */
}
