# settings-src

## Requirements
- Node 16 (recommended: `nvm use 16.20.2`)
- npm (this project has a `package-lock.json`, so prefer npm over yarn)

## Project setup
```
npm ci
```

### Compiles and runs development app on your Homey
```
npm run dev
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

### Notes
- The settings UI imports shared classes from `../.homeybuild/src`. Build the app first from the repo root:
  - `npm run build`
- After that, build the settings UI from this folder:
  - `npm run build`

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
