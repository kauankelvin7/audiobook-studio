# AI governance baseline

O caminho permitido é: adapter → saída estruturada → validação de schema → validação semântica → validação de proveniência/política → persistência. Modelos, prompts e parâmetros devem possuir manifest versionado quando forem introduzidos.

O core determinístico não depende de um provedor específico. Falhas auxiliares devem preservar artefatos válidos e produzir estado equivalente a `CompletedWithWarnings` quando aplicável.
