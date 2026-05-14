# Bar Manager — Documentação do Projeto

## Estrutura

```
bar-app/
├── core/
│   ├── store.js        # Estado global e toda a lógica de negócio
│   └── utils.js        # Funções utilitárias (formatação, helpers)
│
├── web/                # Versão para navegador (HTML/CSS/JS puro)
│   ├── index.html
│   ├── style.css
│   └── app.js          # Controlador que conecta o store ao DOM
│
└── app/                # Versão mobile (React Native + Expo)
    ├── App.js           # Ponto de entrada, navegação por abas
    ├── core/            # (cópia ou symlink de ../core)
    ├── components/
    │   └── BottomNav.js
    └── screens/
        ├── PedidosScreen.js
        ├── CardapioScreen.js
        └── CaixaEstoqueScreen.js  # Exporta CaixaScreen e EstoqueScreen
```

---

## Como rodar a versão Web

Basta abrir o `web/index.html` em um servidor local:

```bash
# Opção 1 — Python (já vem no sistema)
cd bar-app/web
python3 -m http.server 3000
# Acesse: http://localhost:3000

# Opção 2 — Node (precisa de npx)
npx serve bar-app/web
```

> O arquivo usa `import` nativo (ES Modules), portanto **não abre diretamente
> via `file://`** — use um servidor local.

---

## Como rodar a versão App (React Native / Expo)

### 1. Criar o projeto Expo

```bash
npx create-expo-app MeuBar --template blank
cd MeuBar
```

### 2. Copiar os arquivos

```bash
# A partir da raiz do projeto bar-app
cp -r core/           MeuBar/core/
cp    app/App.js      MeuBar/App.js
cp -r app/components/ MeuBar/components/
cp -r app/screens/    MeuBar/screens/
```

### 3. Instalar dependências

```bash
cd MeuBar
npx expo install @react-native-picker/picker
```

### 4. Iniciar

```bash
npx expo start
```

Leia o QR Code com o app **Expo Go** no celular (Android ou iOS).

---

## Arquitetura

```
┌──────────────────────────────────────────┐
│              core/store.js               │
│  - Estado: mesas, produtos, historico    │
│  - Ações: adicionarItem, fecharMesa...   │
│  - Observer pattern (subscribe/notify)   │
└──────────┬───────────────────────────────┘
           │  importado por
    ┌──────┴──────┐
    │             │
┌───▼───┐   ┌────▼────┐
│web/   │   │app/     │
│app.js │   │App.js   │
│ DOM   │   │React    │
│render │   │Native   │
└───────┘   └─────────┘
```

O `store.js` **não depende de nenhum framework**. Ele usa um padrão Observer
simples: qualquer camada (web ou app) chama `store.subscribe(callback)` e
recebe o estado atualizado sempre que algo muda.

---

## Funcionalidades

| Módulo   | Funcionalidade                                              |
|----------|-------------------------------------------------------------|
| Pedidos  | 15 mesas, comanda por mesa, ajuste de quantidade           |
| Cardápio | Cadastro de produtos por categoria, indicador de estoque   |
| Caixa    | Métricas do dia, histórico de comandas, vendas por categoria|
| Estoque  | Alertas de nível baixo, reposição rápida (+10 un)          |

---

## Adicionando persistência (localStorage / AsyncStorage)

No final de `core/store.js`, adicione ao método `notificar()`:

```js
// Web
function notificar() {
  listeners.forEach(fn => fn(state));
  localStorage.setItem('barState', JSON.stringify(state)); // salva
}

// No início, carregue:
const salvo = localStorage.getItem('barState');
let state = salvo ? JSON.parse(salvo) : criarEstadoInicial();
```

Para o app mobile, substitua `localStorage` por `AsyncStorage`:

```js
import AsyncStorage from '@react-native-async-storage/async-storage';

async function salvar() {
  await AsyncStorage.setItem('barState', JSON.stringify(state));
}
```
