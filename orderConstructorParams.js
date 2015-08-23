var gulp                    = require('gulp');
var through                 = require('through2');
var path                    = require('path');
var fs                      = require('fs');
var File                    = require('vinyl');
var _                       = require('lodash');
var endOfLine               = require('os').EOL;

var referencesPath = './src/app/_references.d.ts';

function processFile(file, enc, cb) {
    if (file.isNull()) {
        // do nothing if no contents
    }

    var fileContents = '';
    if(file.isBuffer()) {
        fileContents = file.contents.toString('utf-8');
    }

    var neededRejig = false;
    var result = '';
    if(fileContents) {

        try {
            if (fileContents.trim().indexOf('    constructor (') > -1) {
debugger;
                var constructorIndex = fileContents.trim().indexOf('    constructor (');
                var constructorEnd = fileContents.trim().indexOf(')', constructorIndex);
                var constructorParamsText = fileContents.trim().substring(constructorIndex + '    constructor ('.length, constructorEnd);
                if (constructorParamsText) {

                    var constructorText = fileContents.trim().substring(constructorIndex, constructorEnd);
                    var newConstructorText = constructorParamsText.trim();

                    var constructorRows = _.compact(newConstructorText.split(new RegExp(endOfLine)));
                    // this is weird, endOfLine
                    if (constructorRows.length === 1 && newConstructorText.split('\n').length > 1) {
                        constructorRows = newConstructorText.split('\n');
                    } else if (constructorRows.length === 1 && newConstructorText.indexOf(',') > -1) {
                        constructorRows = newConstructorText.split(',');
                    }
                    constructorRows = _.map(constructorRows, function (row) {
                        return row.trim().replace(',', '');
                    });

                    var publicParams = [];
                    var privateParams = [];
                    var notSavedParams = [];
                    var publicParamsOptional = [];
                    var privateParamsOptional = [];
                    var notSavedParamsOptional = [];
                    var properlyOrderedParams = [];

                    //should have 4 spaces before each param
                    constructorRows.forEach(function (param) {

                        if (param.indexOf('?') > -1) {
                            if (param.trim().indexOf('public') === 0) {
                                publicParamsOptional.push(param.trim());
                            } else if (param.trim().indexOf('private') === 0) {
                                privateParamsOptional.push(param.trim());
                            } else {
                                notSavedParamsOptional.push(param.trim());
                            }
                        } else {
                            if (param.trim().indexOf('public') === 0) {
                                publicParams.push(param.trim());
                            } else if (param.trim().indexOf('private') === 0) {
                                privateParams.push(param.trim());
                            } else {
                                notSavedParams.push(param.trim());
                            }
                        }
                    });

                    publicParams.sort();
                    privateParams.sort();
                    notSavedParams.sort();
                    publicParamsOptional.sort();
                    privateParamsOptional.sort();
                    notSavedParamsOptional.sort();

                    properlyOrderedParams = properlyOrderedParams.concat(
                        publicParams,
                        privateParams,
                        notSavedParams,
                        publicParamsOptional,
                        privateParamsOptional,
                        notSavedParamsOptional
                    );

                    properlyOrderedParams = _.map(properlyOrderedParams, function (param, idx) {
                        if (idx === properlyOrderedParams.length - 1) {
                            return '        ' + param;
                        } else {
                            return '        ' + param + ',';
                        }
                    });
                    properlyOrderedParams.unshift("");

                    newConstructorText = '    constructor (' + properlyOrderedParams.join(endOfLine) + endOfLine + '    ';
                    result = fileContents.trim().replace(constructorText, newConstructorText);
                    neededRejig = true;


                    // Now we are gonna have a go at fixing the associated .spec file
                    // We have the correct constructor order in properlyOrderedParams
                    try {
                        var updateSpec = true;

                        // look for spec
                        var specText = fs.readFileSync(file.path.replace('.ts', '.spec.ts'), 'utf-8');
                        if (specText) {

                            var instantiateClassUnderTestIndex;
                            var instantiateClassUnderTestEnd;

                            if (specText.indexOf('console.warn') > -1) {
                                throw 'NOTESTS';
                            }
                            if (specText.indexOf('DirectiveControllerConstructorFactory') > -1) {
                                throw 'FANCYDIRECTIVE';
                            }

                            if (specText.trim().indexOf('function instantiateClassUnderTest') > -1) {
                                instantiateClassUnderTestIndex = specText.trim().indexOf('function instantiateClassUnderTest');
                            }
                            if (specText.trim().indexOf('let instantiateClassUnderTest = ') > -1) {
                                instantiateClassUnderTestIndex = specText.trim().indexOf('let instantiateClassUnderTest = ');
                            }
                            if (!instantiateClassUnderTestIndex) {
                                throw 'NOCLASSUNDERTEST';
                            }

                            instantiateClassUnderTestEnd = specText.trim().indexOf('}', instantiateClassUnderTestIndex);

                            var instantiateClassUnderTestText = specText.trim().substring(instantiateClassUnderTestIndex, instantiateClassUnderTestEnd + 2);
                            var constructObj = instantiateClassUnderTestText.split(endOfLine);
                            constructObj.pop();
                            constructObj.shift();

                            var allSpecParams;
                            var constructorName;

                            if (constructObj.length > 1) {
                                if (_.last(constructObj).trim().charAt(0) === ')') {
                                    constructObj.pop();
                                } else {
                                    constructObj[constructObj.length - 1] = _.last(constructObj).replace(')', '').replace(';', '');
                                }
                                constructorName = constructObj.shift();
                                allSpecParams = _.map(constructObj, function (param) {
                                    return param.replace(',', '').trim();
                                });
                            } else {
                                var specConstructorText = constructObj[0];
                                var constructorParams = specConstructorText.substring(specConstructorText.indexOf('(') + 1, specConstructorText.indexOf(')'));
                                constructorName = specConstructorText.substring(0, specConstructorText.indexOf('(') + 1);
                                allSpecParams = constructorParams.split(',');
                                allSpecParams = _.map(allSpecParams, function (param) {
                                    return param.trim();
                                });
                            }
                            properlyOrderedParams.shift();

                            if (allSpecParams.length !== properlyOrderedParams.length) {
                                console.error('Different number of params. Stink ' + file.path);
                                updateSpec = false;
                            }

                            var orderedSpecParams = _.map(properlyOrderedParams, function (param) {
                                var constructorParam = param.trim()
                                                     .replace('public ', '')
                                                     .replace('private ', '')
                                                     .replace(',', '');
                                constructorParam = constructorParam.substring(0, constructorParam.indexOf(':'));

                                if (_.includes(allSpecParams, constructorParam)) {
                                    return constructorParam;
                                }
                                if (_.includes(allSpecParams, constructorParam.replace('$', ''))) {
                                    return constructorParam.replace('$', '');
                                }
                                if (_.includes(allSpecParams, constructorParam.replace('$', '') + 'Mock')) {
                                    return constructorParam.replace('$', '') + 'Mock';
                                }
                                if (_.includes(allSpecParams, constructorParam.replace('$', '') + 'ServiceMock')) {
                                    return constructorParam.replace('$', '') + 'ServiceMock';
                                }
                                if (_.includes(allSpecParams, constructorParam.replace('$', '') + 'Service')) {
                                    return constructorParam.replace('$', '') + 'Service';
                                }
                                if (constructorParam === 'apiResult' && _.includes(allSpecParams, 'apiResult')) {
                                    return 'apiResult';
                                }
                                if (constructorParam === 'apiResult' && _.includes(allSpecParams, 'tmApiListingMock')) {
                                    return 'tmApiListingMock';
                                }
                                if (constructorParam === 'currentMemberService' && _.includes(allSpecParams, 'member')) {
                                    return 'member';
                                }
                                console.error('MATCH NOT FOUND :(  ' + file.path);
                                updateSpec = false;
                                return constructorParam;
                            });
                            orderedSpecParams = _.map(orderedSpecParams, function (param, idx) {
                                if (idx === properlyOrderedParams.length - 1) {
                                    return '                ' + param;
                                } else {
                                    return '                ' + param + ',';
                                }
                            });

                            orderedSpecParams.unshift(constructorName);
                            orderedSpecParams.unshift("let instantiateClassUnderTest = () => {");
                            orderedSpecParams.push("            );");
                            orderedSpecParams.push("        };");

                            var newSpecConstructorText = orderedSpecParams.join(endOfLine);

                            specText = specText.replace(instantiateClassUnderTestText, newSpecConstructorText);

                            if (updateSpec) {
                                var thing = fs.writeFileSync(file.path.replace('.ts', '.spec.ts'), specText, 'utf-8');
                                console.log('EVERRYTHING WENT EXCELLENT');
                            }
                        }

                    } catch (e) {
                        if (e.code === 'ENOENT') {
                            // No spec file. Its kewl;
                        } else if (e === 'NOCLASSUNDERTEST') {
                            console.warn('instantiateClassUnderTest not being used');
                        } else if (e === 'FANCYDIRECTIVE') {
                            console.warn('Fancy directive. Lets skip this');
                        } else if (e === 'NOTESTS') {
                            console.warn('No tests. Its sweet');
                        } else {
                            console.error('SOMETHING WENT WRONG?!?!?!: ' + file.path, e);
                        }
                    }
                }
            }
        } catch(e) {
            console.error('Parsing file failed. Im too lazy to figure out why: ', e);
            return cb();
        }

        if (neededRejig) {
            file.contents = new Buffer(result);
        }

        this.push(file);
    }
    return cb();
}

function onStreamFinished(cb) {
    console.log('All done! Fuck yeah.\r\n===================================');
    return cb();
}

function gulpFuckYeah(options) {
    // creating a stream through which each file will pass
    return through.obj(processFile, onStreamFinished);
}

gulp.src(['./src/app/**/*.ts', '!./src/app/**/*spec.ts'])
//gulp.src('./src/app/shared/directives/pagination/directive/PageLink.ts')
    .pipe(gulpFuckYeah({}))
    .pipe(gulp.dest('./src/app'));

