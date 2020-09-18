'use strict'

const nunjucks = require('nunjucks')
const gulp = require('gulp')
const configPaths = require('../../config/paths.json')
const postcss = require('gulp-postcss')
const autoprefixer = require('autoprefixer')
const taskArguments = require('./task-arguments')
const filter = require('gulp-filter')
const fs = require('fs')
const yamlToJson = require('js-yaml')
const path = require('path')
const map = require('map-stream')
const rename = require('gulp-rename')
const _ = require('lodash')

const scssFiles = filter([configPaths.src + '**/*.scss'], { restore: true })
const yamlFiles = filter([configPaths.components + '**/*.yaml'], { restore: true })

gulp.task('copy-files', () => {
  return gulp.src([
    configPaths.src + '**/*',
    '!**/.DS_Store',
    '!**/*.test.js',
    '!' + configPaths.src + 'README.md', // Don't override the existing README in /package
    '!' + configPaths.components + '**/__snapshots__/**',
    '!' + configPaths.components + '**/__snapshots__/'
  ])
    .pipe(scssFiles)
    .pipe(postcss([
      autoprefixer
    ], { syntax: require('postcss-scss') }))
    .pipe(scssFiles.restore)
    .pipe(yamlFiles)
    .pipe(map(function (file, done) {
      const fixturesFile = generateFixtures(file)
      done(null, fixturesFile)
    }))
    .pipe(rename(path => {
      path.basename = 'fixtures'
      path.extname = '.json'
    }))
    .pipe(yamlFiles)
    .pipe(map(function (file, done) {
      const macroFile = generateMacroOptions(file)
      done(null, macroFile)
    }))
    .pipe(rename(path => {
      path.basename = 'macro-options'
      path.extname = '.json'
    }))
    .pipe(yamlFiles.restore)
    .pipe(gulp.dest(taskArguments.destination + '/govuk/'))
})

function generateFixtures (file) {
  const json = convertYamlToJson(file)
  const componentName = path.dirname(file.path).split(path.sep).slice(-1).toString()
  const componentTemplatePath = path.join(configPaths.components, componentName, 'template.njk')

  if (json) {
    const examplesJson = json.examples

    if (examplesJson) {
      const fixtures = {
        component: componentName,
        fixtures: []
      }

      examplesJson.forEach(function (example) {
        validateExample(componentName, example, json.params)

        const fixture = {
          name: example.name,
          options: example.data,
          html: nunjucks.render(componentTemplatePath, { params: example.data }).trim()
        }

        fixtures.fixtures.push(fixture)
      })

      file.contents = Buffer.from(JSON.stringify(fixtures, null, 4))
      return file
    } else {
      console.error(file.path + ' is missing "examples" and/or "params"')
    }
  }
}

function validateExample(componentName, example, spec) {
  spec.forEach(function (item) {
    // Exempt html / text params from validation
    if (['html', 'text'].includes(item.name.slice(-4))) {
      return
    }

    if (item.required && !(_.get(example.data, item.name, false))) {
      throw new Error(`"${componentName} -> ${example.name}" is not a valid example. "${item.name}" missing but marked as required.`)
    }

    // Recurse into array params
    if(item.type === 'array' && item.params) {
      let subSpec = spec.find(subSpec => subSpec.name === item.name).params
      example.data[item.name].forEach(function(subItem, index) {
        validateExample(`${componentName}`, { name: `${example.name}.${item.name}[${index}]`, data: subItem }, subSpec)
      })
    }
  })
}

function generateMacroOptions (file) {
  const json = convertYamlToJson(file)
  let paramsJson

  if (json) {
    paramsJson = json.params // We only want the 'params' data from component yaml

    if (paramsJson) {
      file.contents = Buffer.from(JSON.stringify(paramsJson, null, 4))
      return file
    } else {
      console.error(file.path + ' is missing "params"')
    }
  }
}

function convertYamlToJson (file) {
  const componentName = path.dirname(file.path).split(path.sep).slice(-1).toString()
  const componentPath = path.join(configPaths.components, componentName, `${componentName}.yaml`)
  let yaml

  try {
    yaml = fs.readFileSync(componentPath, { encoding: 'utf8', json: true })
  } catch (e) {
    console.error('ENOENT: no such file or directory: ', componentPath)
  }

  if (yaml) {
    return yamlToJson.safeLoad(yaml)
  }

  return false
}
