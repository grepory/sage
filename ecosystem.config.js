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
      user: 'deploy',
      host: 'mother',
      ref: 'origin/main',
      repo: 'https://github.com/grepory/ragu.git',
      path: '/Users/deploy/apps/ragu',
      'post-deploy': `
        # Activate venv and install requirements
        source ../shared/venv/bin/activate &&
        pip install --upgrade pip &&
        pip install -r requirements.txt &&
        # Create symlinks
        ln -sfn ../shared/chromadb ./chromadb &&
        ln -sfn ../shared/venv ./venv &&
        # Copy env and restart
        cp ../.env .env &&
        /usr/local/bin/pm2 reload ecosystem.config.js --env production &&
        /usr/local/bin/node /Users/deploy/bin/update-caddy-config.js
      `
    }
  }
};
