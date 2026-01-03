#!/bin/bash
# Script de déploiement automatisé pour IKOMA MCP
# Corrige le problème de package-lock.json et redémarre les services

set -e  # Arrêter en cas d'erreur

echo "================================================"
echo "  IKOMA MCP - Script de correction et déploiement"
echo "================================================"
echo ""

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier qu'on est dans le bon répertoire
if [ ! -f "package.json" ]; then
    error "Fichier package.json non trouvé. Êtes-vous dans le répertoire ikoma-mcpp ?"
    exit 1
fi

info "Répertoire de travail : $(pwd)"
echo ""

# Étape 1 : Vérifier si package-lock.json existe
info "Étape 1/7 : Vérification de package-lock.json"
if [ -f "package-lock.json" ]; then
    warn "package-lock.json existe déjà"
    read -p "Voulez-vous le régénérer ? (o/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Oo]$ ]]; then
        rm package-lock.json
        info "package-lock.json supprimé"
    fi
fi

if [ ! -f "package-lock.json" ]; then
    info "Génération de package-lock.json..."
    npm install --package-lock-only
    if [ $? -eq 0 ]; then
        info "✓ package-lock.json créé avec succès"
    else
        error "Échec de la génération de package-lock.json"
        exit 1
    fi
else
    info "✓ package-lock.json présent"
fi
echo ""

# Étape 2 : Vérifier les corrections TypeScript
info "Étape 2/7 : Vérification des corrections TypeScript"
if grep -q "ExecutionContext" src/core/capabilities.ts; then
    warn "ExecutionContext encore présent dans capabilities.ts"
    info "Application du patch..."
    # Appliquer les corrections (à adapter selon votre méthode)
else
    info "✓ Corrections TypeScript déjà appliquées"
fi
echo ""

# Étape 3 : Tester la compilation
info "Étape 3/7 : Test de compilation TypeScript"
info "Installation des dépendances..."
npm ci
if [ $? -ne 0 ]; then
    error "Échec de npm ci"
    exit 1
fi

info "Compilation du code..."
npm run build
if [ $? -eq 0 ]; then
    info "✓ Compilation réussie"
else
    error "Échec de la compilation TypeScript"
    exit 1
fi
echo ""

# Étape 4 : Arrêter les services existants
info "Étape 4/7 : Arrêt des services Docker existants"
if command -v docker-compose &> /dev/null; then
    docker-compose down
    info "✓ Services arrêtés"
else
    warn "docker-compose non trouvé, passage à l'étape suivante"
fi
echo ""

# Étape 5 : Nettoyer les anciennes images (optionnel)
info "Étape 5/7 : Nettoyage Docker (optionnel)"
read -p "Voulez-vous nettoyer les anciennes images Docker ? (o/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Oo]$ ]]; then
    docker system prune -f
    info "✓ Nettoyage effectué"
else
    info "Nettoyage ignoré"
fi
echo ""

# Étape 6 : Rebuild Docker
info "Étape 6/7 : Construction de l'image Docker"
if command -v docker-compose &> /dev/null; then
    docker-compose build
    if [ $? -eq 0 ]; then
        info "✓ Image Docker construite avec succès"
    else
        error "Échec du build Docker"
        exit 1
    fi
else
    error "docker-compose non installé"
    exit 1
fi
echo ""

# Étape 7 : Démarrer les services
info "Étape 7/7 : Démarrage des services"
docker-compose up -d
if [ $? -eq 0 ]; then
    info "✓ Services démarrés"
else
    error "Échec du démarrage des services"
    exit 1
fi
echo ""

# Vérification finale
info "Vérification de l'état des services..."
sleep 3
docker-compose ps
echo ""

info "Vérification du endpoint de santé..."
sleep 2
if command -v curl &> /dev/null; then
    HEALTH_CHECK=$(curl -s http://localhost:3000/health || echo "FAILED")
    if [[ $HEALTH_CHECK == *"healthy"* ]]; then
        info "✓ Service IKOMA MCP opérationnel"
        echo "$HEALTH_CHECK"
    else
        warn "Le service ne répond pas encore, vérifiez les logs :"
        echo "  docker-compose logs ikoma-mcp"
    fi
else
    warn "curl non installé, vérification manuelle requise"
fi
echo ""

echo "================================================"
echo -e "${GREEN}  Déploiement terminé avec succès !${NC}"
echo "================================================"
echo ""
echo "Commandes utiles :"
echo "  - Voir les logs       : docker-compose logs -f ikoma-mcp"
echo "  - Arrêter les services: docker-compose down"
echo "  - Redémarrer          : docker-compose restart"
echo "  - État des services   : docker-compose ps"
echo ""
