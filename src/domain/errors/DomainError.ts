/** Erro de regra de negócio do domínio. As camadas externas traduzem para HTTP/log. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOMAIN_ERROR",
  ) {
    super(message);
    this.name = "DomainError";
  }
}
