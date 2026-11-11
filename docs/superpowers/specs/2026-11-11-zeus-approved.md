# Zeus — escolhas aprovadas

O utilizador aprovou todos os ecrãs em `prototipos/estilo/zeus/`: «está top! implementa todos os ecrãs então. guarda as minhas escolhas, adorei.» A aprovação cobre a implementação da direção apresentada, sem nova ronda de propostas.

## Design definitivo

Apple TV escuro, componentes de vidro discretos, organização Netflix e arte mitológica animada. Preservar as obras, paletas, tipografia, composições e efeitos dos protótipos: Zeus na Entrada/Portal, subida ao Olimpo no Onboarding, Termópilas no Cinema, Ulisses na Pesquisa, Gladiador no Título, Medusa na pausa, Hermes na TV, Hefesto nos Add-ons, Atena na Conta, Conselho dos Deuses na Administração e relógio nos Estados. Movimento reduzido, teclado, mobile e PT-PT obrigatórios. Créditos preservados.

## Decisões funcionais anteriores

Aplicação privada, contas por convite, sem perfis. Administrador e Membro. Listas IPTV, progresso, favoritos, configuração de Add-ons e chave TMDB privados por Membro. Catálogo de Add-ons importado e sujeito a aprovação; sem URLs arbitrários introduzidos por Membros. Configuração interna com adaptador Torrentio. Better Auth com password e TOTP; Turnstile e Resend configuráveis por credenciais. Primeiro arranque local no Mac, Motor local, futura separação em servidor. Android/box fora desta fase.

## Stack aprovada

React + Vite, TanStack Router/Query, Tailwind, GSAP e Three.js; Electron no desktop. Hono com módulos MVC, Drizzle e PostgreSQL. Implementar ecrãs reais e persistência, com estados vazios/erro honestos. Não simular sucesso em serviços não configurados. Manter o MacStream e os protótipos de referência. Migração de dados antigos ainda sem decisão: não importar nem apagar automaticamente.

## Implementação

Um frontend em apps/web, API em apps/api e Motor original conservado. Docker PostgreSQL local em porta dedicada. Os desenhos aprovados são a especificação visual. O primeiro Administrador é criado no arranque inicial; os seguintes entram por Convite. Credenciais de Resend/Turnstile não disponíveis não devem bloquear o arranque local nem ser inventadas: comunicar limitações e impedir falsas confirmações.
