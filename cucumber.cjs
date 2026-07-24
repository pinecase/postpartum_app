module.exports = {
  default: {
    paths: ['tests/bdd/features/**/*.feature'],
    import: ['tests/bdd/steps/**/*.mjs'],
    publishQuiet: true,
  },
};
