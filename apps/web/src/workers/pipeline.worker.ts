export type PipelineMessage = { type: "extract"; file: File };
export type PipelineResponse = {
  type: "error";
  code: "EXTRACTOR_NOT_CONFIGURED";
  message: string;
};

self.onmessage = (event: MessageEvent<PipelineMessage>) => {
  if (event.data.type === "extract") {
    const response: PipelineResponse = {
      type: "error",
      code: "EXTRACTOR_NOT_CONFIGURED",
      message: "PDF adapter ainda não conectado",
    };
    self.postMessage(response);
  }
};
