// config-overrides.js
module.exports = function override(config) {
    // --- keep your existing fallbacks (for node core polyfills) ---
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      assert: require.resolve('assert/')
      // add more if webpack complains: util, path, stream, etc.
      // util: require.resolve('util/'),
      // path: require.resolve('path-browserify')
    };
  
    // --- make .cjs resolvable as JS ---
    if (!config.resolve.extensions.includes('.cjs')) {
      config.resolve.extensions.push('.cjs');
    }
  
    // Insert a rule for .cjs BEFORE CRA's catch-all asset rule
    const oneOfRule = config.module.rules.find(r => Array.isArray(r.oneOf));
    if (oneOfRule) {
      oneOfRule.oneOf.unshift({
        test: /\.cjs$/,
        include: /node_modules/,
        type: 'javascript/auto'
        // No loader needed; we just want webpack to parse it as JS,
        // not turn it into /static/media/... URLs.
      });
    }
  
    // (Optional) silence noisy source-map warnings you saw
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@formatjs\/fast-memoize/ }
    ];
  
    return config;
  };
  