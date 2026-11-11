import { Art, Page } from "../components/Layout";
export default function Guide() {
  return (
    <Page>
      <Art
        image="olimpo"
        title="Uma linguagem. Um universo."
        eyebrow="O desenho do Zeus"
      >
        <p>
          Arte clássica, luz em movimento e espaço para as histórias respirarem.
        </p>
      </Art>
      <div className="app-content">
        <div className="surface">
          <h2>Direção aprovada</h2>
          <p>
            Apple TV escuro, organização Netflix, figuras da mitologia e
            movimentos subtis. Todas as animações respeitam a preferência de
            movimento reduzido do dispositivo.
          </p>
          <div className="button-row">
            <a href="/cinema" className="z-btn z-btn--primary">
              Cinema
            </a>
            <a href="/tv" className="z-btn z-btn--secondary">
              TV
            </a>
            <a href="/art/img/CREDITOS.md" className="z-btn z-btn--ghost">
              Créditos das obras
            </a>
          </div>
        </div>
      </div>
    </Page>
  );
}
