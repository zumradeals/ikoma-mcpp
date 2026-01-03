# 🏗️ IKOMA MCP v2.0

**Serveur Model Context Protocol Souverain pour le Déploiement VPS Piloté par IA**

IKOMA MCP est un serveur MCP sécurisé et audité qui permet aux assistants IA de déployer et gérer des applications sur un VPS sans exposer l'accès shell.

## 🎯 Fonctionnalités Clés

- **Conformité MCP Native** : Entièrement conforme à la spécification Model Context Protocol
- **Transport Hybride** : stdio (MCP natif) + HTTP REST (optionnel)
- **Architecture Zero Trust** : Aucun accès shell, capacités en liste blanche uniquement
- **Contrôle d'Accès Basé sur les Rôles** : Observateur, Opérateur, Constructeur, Administrateur
- **Piste d'Audit Complète** : Chaque action journalisée avec rédaction des secrets
- **Confinement des Chemins** : Toutes les opérations restreintes à `/srv/apps/<app>/`
- **PostgreSQL Souverain** : Aucune dépendance externe
- **Intégration Docker** : Orchestration de conteneurs gérée via Docker Compose

## 🏛️ Architecture

```
┌─────────────────┐
│  Client IA      │
│  (MCP stdio)    │
└────────┬────────┘
         │
    ┌────▼────┐
    │  IKOMA  │──────┐
    │   MCP   │      │
    │ Serveur │◄─────┤  API HTTP (optionnel)
    └────┬────┘      │
         │           │
    ┌────▼────────┐  │
    │ Logique     │◄─┘
    │  Centrale   │
    └─────┬───────┘
          │
    ┌─────▼──────┬──────────┐
    │   Docker   │ PostgreSQL │
    └────────────┴────────────┘
```

## 🔐 Modèle de Sécurité

### Hiérarchie des Rôles

| Rôle | Niveau | Capacités |
|------|--------|-----------|
| **observateur** | 1 | Accès lecture seule (liste, statut, santé) |
| **opérateur** | 2 | + Déploiement, redémarrage, sauvegarde |
| **constructeur** | 3 | + Initialisation d'apps, opérations DB, migrations |
| **administrateur** | 4 | + Suppression d'apps, opérations destructives |

### Fonctionnalités de Sécurité

- ✅ Authentification par clé API (hashée SHA256)
- ✅ Rédaction automatique des secrets dans les logs
- ✅ Prévention de traversée de chemins
- ✅ Isolation du socket Docker
- ✅ Isolation utilisateur PostgreSQL
- ✅ Aucune exécution de commande arbitraire

## 📦 Installation

### Prérequis

- Ubuntu 24.04 LTS (ou compatible)
- Accès root
- Connexion Internet

### Installation Rapide

```bash
# Cloner le dépôt
git clone https://github.com/zumradeals/ikoma-mcpp.git
cd ikoma-mcpp

# Copier les fichiers vers /opt/ikoma
sudo mkdir -p /opt/ikoma
sudo cp -r . /opt/ikoma/

# Exécuter le script d'installation
sudo bash /opt/ikoma/scripts/install.sh
```

Le script va :
1. Installer Docker, Docker Compose, Node.js
2. Créer les répertoires nécessaires
3. Générer la clé API et la configuration
4. Construire et démarrer IKOMA MCP
5. Afficher votre clé API (sauvegardez-la en sécurité !)

### Installation Manuelle

Voir [INSTALL.md](INSTALL.md) pour les étapes d'installation manuelle détaillées.

## 🚀 Utilisation

### Client MCP (stdio)

Configurez votre client MCP pour utiliser IKOMA :

```json
{
  "mcpServers": {
    "ikoma": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/opt/ikoma/docker-compose.yml",
        "run",
        "--rm",
        "ikoma-mcp",
        "node",
        "dist/index.js",
        "mcp"
      ],
      "env": {
        "IKOMA_ROLE": "operator"
      }
    }
  }
}
```

Ensuite, utilisez les capacités :

```javascript
// Lister les outils disponibles
const tools = await client.listTools();

// Exécuter une capacité
const result = await client.callTool({
  name: "platform.info",
  arguments: {}
});
```

### API HTTP

```bash
# Obtenir la clé API
API_KEY=$(cat /opt/ikoma/api-key.txt)

# Informations de la plateforme
curl -X POST http://localhost:3000/execute/platform.info \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Role: observer" \
  -H "Content-Type: application/json" \
  -d '{}'

# Initialiser une application
curl -X POST http://localhost:3000/execute/apps.init \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Role: builder" \
  -H "Content-Type: application/json" \
  -d '{"appName":"myapp"}'

# Déployer une application
curl -X POST http://localhost:3000/execute/deploy.up \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Role: operator" \
  -H "Content-Type: application/json" \
  -d '{"appName":"myapp"}'
```

## 🛠️ Registre Complet des Outils (19 Outils)
**⚠️ LISTE CANONIQUE FIGÉE - SORTIE EXACTE DE CAPABILITIES.map(c => c.name)**

```javascript
// Source : src/core/capabilities.ts - tableau CAPABILITIES
[
  "platform.info",           // 1
  "platform.check",          // 2
  "apps.list",               // 3
  "apps.status",             // 4
  "apps.health",             // 5
  "apps.init",               // 6
  "apps.remove",             // 7
  "apps.env.example",        // 8
  "apps.validate",           // 9
  "deploy.up",               // 10
  "deploy.down",             // 11
  "deploy.restart",          // 12
  "db.create",               // 13
  "db.migrate",              // 14
  "db.seed",                 // 15
  "db.backup",               // 16
  "db.status",               // 17
  "artifact.generate_runbook",  // 18
  "artifact.verify_release"     // 19
]
```

### Plateforme (2 outils)

| # | Outil | Rôle | Description |
|---|-------|------|-------------|
| 1 | `platform.info` | observateur | Obtenir les informations de la plateforme et les capacités disponibles |
| 2 | `platform.check` | observateur | Vérifier la santé de la plateforme (Docker, PostgreSQL, système de fichiers) |

### Applications (7 outils)

| # | Outil | Rôle | Description |
|---|-------|------|-------------|
| 3 | `apps.list` | observateur | Lister toutes les applications déployées |
| 4 | `apps.status` | observateur | Obtenir le statut d'une application spécifique |
| 5 | `apps.health` | observateur | Vérifier la santé d'une application spécifique |
| 6 | `apps.init` | constructeur | Initialiser une nouvelle structure de répertoire d'application |
| 7 | `apps.remove` | administrateur | Supprimer complètement une application (conteneurs, base de données, fichiers) |
| 8 | `apps.env.example` | observateur | Générer un exemple de variables d'environnement pour une application |
| 9 | `apps.validate` | observateur | Valider la configuration et la structure d'une application |

### Déploiement (3 outils)

| # | Outil | Rôle | Description |
|---|-------|------|-------------|
| 10 | `deploy.up` | opérateur | Démarrer les conteneurs d'application |
| 11 | `deploy.down` | opérateur | Arrêter les conteneurs d'application |
| 12 | `deploy.restart` | opérateur | Redémarrer les conteneurs d'application |

### Base de Données (5 outils)

| # | Outil | Rôle | Description |
|---|-------|------|-------------|
| 13 | `db.create` | constructeur | Créer une nouvelle base de données PostgreSQL pour une application |
| 14 | `db.migrate` | constructeur | Exécuter une migration SQL sur la base de données d'application |
| 15 | `db.seed` | constructeur | Insérer des données de départ dans la base de données d'application |
| 16 | `db.backup` | opérateur | Créer une sauvegarde de la base de données d'application |
| 17 | `db.status` | observateur | Obtenir le statut et les informations de la base de données |

### Artefacts (2 outils)

| # | Outil | Rôle | Description |
|---|-------|------|-------------|
| 18 | `artifact.generate_runbook` | observateur | Générer un runbook de déploiement pour une application |
| 19 | `artifact.verify_release` | observateur | Vérifier le statut et la préparation d'une release d'application |

---

**TOTAL : 19 outils** (2 + 7 + 3 + 5 + 2 = 19) ✅

## 🧪 Tests

Exécuter la suite de tests de fumée :

```bash
sudo bash /opt/ikoma/scripts/smoke-test.sh
```

Cela valide :
- Santé de la plateforme
- Authentification
- Cycle de vie des applications (init, statut, validation, suppression)
- Opérations de base de données
- Génération d'artefacts

## 📊 Surveillance

### Consulter les Logs

```bash
# Logs de l'application
docker compose -f /opt/ikoma/docker-compose.yml logs -f

# Piste d'audit
tail -f /var/log/ikoma/audit.jsonl | jq
```

### Format du Log d'Audit

```json
{
  "timestamp": "2026-01-02T10:30:00.000Z",
  "requestId": "abc123",
  "capability": "apps.init",
  "role": "builder",
  "arguments": {"appName": "myapp"},
  "result": "success",
  "duration": 150
}
```

## 🔧 Configuration

Éditer `/opt/ikoma/.env` :

```bash
# Mode serveur
SERVER_MODE=hybrid          # mcp | http | hybrid

# Bascules de transport
MCP_ENABLED=true
HTTP_ENABLED=true
HTTP_PORT=3000

# PostgreSQL
POSTGRES_PASSWORD=votre_mot_de_passe_securise

# Clé API (hash SHA256)
API_KEY_HASH=votre_hash_ici

# Rôle par défaut pour MCP stdio
IKOMA_ROLE=operator
```

Appliquer les changements :

```bash
cd /opt/ikoma
sudo docker compose restart
```

## 📚 Documentation

- [README-runbook.md](README-runbook.md) - Modèle de runbook de déploiement
- [DEMO-SESSION.md](DEMO-SESSION.md) - Démonstration interactive pas à pas
- [ARCHITECTURE.md](ARCHITECTURE.md) - Détails de l'architecture technique

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez d'abord lire [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 Licence

Licence MIT - voir le fichier [LICENSE](LICENSE).

## 🆘 Support

- Issues GitHub : https://github.com/zumradeals/ikoma-mcpp/issues
- Documentation : Voir les fichiers de documentation du projet (README-runbook.md, DEMO-SESSION.md)

## 🙏 Remerciements

Construit avec :
- [Model Context Protocol](https://modelcontextprotocol.io) par Anthropic
- [PostgreSQL](https://postgresql.org)
- [Docker](https://docker.com)
- [Node.js](https://nodejs.org)

---

**Fait avec ❤️ pour la communauté de déploiement IA**
