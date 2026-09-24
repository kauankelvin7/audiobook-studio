import { describe, expect, it } from "vitest";
import { userError } from "./user_error";

describe("mensagens exibidas ao usuário", () => {
  it("explica por que um documento parcialmente aprovado não pode gerar áudio", () => {
    expect(userError(new Error("every source page requires approved narratable content"), "Falha"))
      .toMatch(/páginas sem texto aprovado/i);
  });

  it("oculta detalhes internos e oferece uma ação", () => {
    expect(userError(new Error("InvalidApproval: script hash mismatch"), "Falha"))
      .not.toMatch(/InvalidApproval|hash|script/i);
    expect(userError(new Error("Failed to deserialize WASM payload"), "Tente novamente."))
      .toMatch(/Reabra|Tente novamente/i);
  });

  it("preserva mensagens claras já escritas em português", () => {
    expect(userError(new Error("Escolha um PDF menor."), "Falha"))
      .toBe("Escolha um PDF menor.");
  });
});
