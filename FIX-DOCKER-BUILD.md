# Solution au problème Docker Build - IKOMA MCP

## Problème identifié

L'erreur `npm ci` dans le Dockerfile est causée par **l'absence du fichier `package-lock.json`** dans le dépôt Git.

```
failed to solve: process "/bin/sh -c npm ci" did not complete successfully: exit code: 1
```

## Solution

### Option 1 : Ajouter package-lock.json au dépôt (Recommandé)

Le fichier `package-lock.json` a été généré et doit être commité dans le dépôt Git.

**Étapes à suivre :**

```bash
# Ajouter le fichier package-lock.json au dépôt
git add package-lock.json

# Commiter le changement
git commit -m "fix: Add missing package-lock.json for Docker build"

# Pousser vers le dépôt distant
git push origin main
```

**Sur votre serveur Contabo :**

```bash
# Se positionner dans le répertoire du projet
cd ~/ikoma-mcpp

# Récupérer les dernières modifications
git pull origin main

# Relancer le build Docker
docker-compose build

# Démarrer les services
docker-compose up -d
```

### Option 2 : Modifier le Dockerfile pour utiliser npm install (Alternative)

Si vous ne souhaitez pas commiter le `package-lock.json`, modifiez le Dockerfile :

**Avant (ligne 13) :**
```dockerfile
RUN npm ci
```

**Après (ligne 13) :**
```dockerfile
RUN npm install --production=false
```

**Note :** Cette approche est moins recommandée car :
- Les builds sont moins reproductibles
- Les versions des dépendances peuvent varier entre les builds
- C'est plus lent que `npm ci`

## Pourquoi package-lock.json est important

Le fichier `package-lock.json` :
- **Garantit la reproductibilité** : Installe exactement les mêmes versions de dépendances
- **Améliore la sécurité** : Verrouille les versions testées et sécurisées
- **Accélère les builds** : `npm ci` est optimisé pour les environnements CI/CD
- **Évite les surprises** : Pas de mises à jour imprévues de dépendances

## Vérification

Après avoir appliqué la solution, vérifiez que le build fonctionne :

```bash
# Test du build
docker-compose build

# Si succès, vérifier les logs
docker-compose logs ikoma-mcp

# Tester le service
curl http://localhost:3000/health
```

## Vulnérabilités détectées

Lors de la génération du `package-lock.json`, npm a détecté **4 vulnérabilités de sévérité modérée**.

Pour les corriger :

```bash
# Audit des vulnérabilités
npm audit

# Correction automatique (peut inclure des breaking changes)
npm audit fix --force

# Ou correction manuelle après analyse
npm audit fix
```

## Fichiers modifiés

- ✅ `package-lock.json` : Créé (192 KB)
- 📄 Ce fichier de documentation : `FIX-DOCKER-BUILD.md`
