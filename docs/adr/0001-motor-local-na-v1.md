# Motor local no Mac na v1, preparado para ir para servidor

Na v1 o Motor corre no Mac do Administrador, como hoje, e o tráfego P2P é escondido por uma VPN comercial ligada nesse Mac; a API e a base de dados são independentes do Motor. Escolhemos isto por custo zero. O preço é que os outros ecrãs (box, telemóvel) só reproduzem torrents com o Mac ligado e na mesma rede.

## Considered Options

- **Motor numa VPS com VPN (gluetun)**: funciona sem o Mac, mas custa cerca de 10–15 €/mês; fica como passo seguinte.
- **Debrid sem Motor**: o mais barato sem Mac (3–4 €/mês) e sem P2P no nosso IP; alternativa ao passo seguinte.
- **VPS sem VPN**: rejeitado, porque o IP do alojamento fica exposto nos swarms e as queixas DMCA levam à suspensão da conta.
- **VPN só no cliente com o Motor no servidor**: rejeitado, porque a VPN só esconde o tráfego da máquina onde corre o Motor.

## Consequences

O Motor é um serviço à parte, com contrato HTTP próprio, para poder mudar de máquina sem alterar a API nem o frontend.
