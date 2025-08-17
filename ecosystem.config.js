module.exports = {
  apps: [{
    name: 'ragu',
    script: '../shared/venv/bin/python',  // Use venv python
    args: 'run_app.py',
    cwd: '/Users/deploy/apps/ragu/current',
    env: {
      PYTHONPATH: '/Users/deploy/apps/ragu/current',
      PORT: 3001,
      NODE_ENV: 'production',
      CHROMA_DB_PATH: '/Users/deploy/apps/ragu/shared/chromadb',
      VIRTUAL_ENV: '/Users/deploy/apps/ragu/shared/venv',
      PATH: '/Users/deploy/apps/ragu/shared/venv/bin:/usr/local/bin:/usr/bin:/bin'
    }
  }],
  deploy: {
    production: {
      "user": 'deploy',
      "host": 'mother',
      "ref": 'origin/main',
      "repo": 'https://github.com/grepory/ragu.git',
      "path": '/Users/deploy/apps/ragu',
      "post-deploy": "echo 'Installing dependencies...' && source ../shared/venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt && echo 'Creating symlinks...' && ln -sfn ../shared/chromadb ./chromadb && echo 'Copying .env...' && cp ../.env .env && echo 'Starting application...' && pm2 startOrRestart ecosystem.config.js --env production && echo 'Updating Caddy...' && /usr/local/bin/node /Users/deploy/bin/update-caddy-config.js && echo 'Deployment complete!'",
    }
  }
};
