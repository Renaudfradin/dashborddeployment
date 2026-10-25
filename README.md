# Dashboard déploiements

Interface pour consulter et piloter des services déployés sur Vercel, Railway, GitHub Pages, Scaleway et Netlify. Chaque compte relie ses propres tokens.

## Démarrage

```bash
docker compose up --build
```

- Interface : http://localhost:3024
- API : http://localhost:8024

Créez un compte depuis l’interface, puis ajoutez un hébergeur. Un token invalide est refusé et n’est pas enregistré.

Les tokens d’hébergement sont chiffrés en base avec `CREDENTIALS_ENCRYPTION_KEY`. Ils ne sont plus renvoyés à l’interface après l’enregistrement
