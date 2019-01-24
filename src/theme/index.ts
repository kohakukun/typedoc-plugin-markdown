import * as fs from 'fs';
import * as path from 'path';
import {
    DeclarationReflection,
    ProjectReflection,
    Reflection,
    ReflectionKind,
} from 'typedoc/dist/lib/models/reflections/index';
import { PageEvent } from 'typedoc/dist/lib/output/events';
import { UrlMapping } from 'typedoc/dist/lib/output/models/UrlMapping';
import { Renderer } from 'typedoc/dist/lib/output/renderer';
import { DefaultTheme } from 'typedoc/dist/lib/output/themes/DefaultTheme';
import { setProps } from './props';
import { getAnchorRef, getMarkdownEngine } from './utils';

export class MarkdownTheme extends DefaultTheme {
    /**
     * This is mostly a copy of the DefaultTheme method with .html ext switched to .md
     * Builds the url for the the given reflection and all of its children.
     *
     * @param reflection  The reflection the url should be created for.
     * @param urls The array the url should be appended to.
     * @returns The altered urls array.
     */
    public static buildUrls(
        reflection: DeclarationReflection,
        urls: UrlMapping[],
    ): UrlMapping[] {
        const mapping = DefaultTheme.getMapping(reflection);
        // console.log(reflection);
        if (mapping) {
            if (
                !reflection.url ||
                !DefaultTheme.URL_PREFIX.test(reflection.url)
            ) {
                const url =
                    getMarkdownEngine() === 'githubWiki'
                        ? [
                              MarkdownTheme.getUrl(reflection, undefined, '-') +
                                  '.md',
                          ].join('/')
                        : [
                              mapping.directory,
                              MarkdownTheme.getUrl(reflection, undefined, '.') +
                                  '.md',
                          ].join('/');
                //  jsonfile.writeFileSync(`./out/${getMarkdownEngine()}/${url}`, reflection);

                urls.push(new UrlMapping(url, reflection, mapping.template));
                reflection.url = url;
                reflection.hasOwnDocument = true;
            }
            if (reflection.children) {
                for (const key in reflection.children) {
                    if (reflection.children.hasOwnProperty(key)) {
                        const child = reflection.children[key];
                        if (
                            mapping.isLeaf ||
                            getMarkdownEngine() === 'githubWiki'
                        ) {
                            MarkdownTheme.applyAnchorUrl(child, reflection);
                        } else {
                            MarkdownTheme.buildUrls(child, urls);
                        }
                    }
                }
            }
        } else if (reflection.parent) {
            MarkdownTheme.applyAnchorUrl(reflection, reflection.parent);
        }

        return urls;
    }

    /**
     * Similar to DefaultTheme method with added functionality to cater for bitbucket heading and single file anchors
     * Generate an anchor url for the given reflection and all of its children.
     *
     * @param reflection  The reflection an anchor url should be created for.
     * @param container   The nearest reflection having an own document.
     */
    public static applyAnchorUrl(
        reflection: Reflection,
        container: Reflection,
    ) {
        if (!reflection.url || !DefaultTheme.URL_PREFIX.test(reflection.url)) {
            let anchor = MarkdownTheme.getUrl(reflection, container, '.');

            if (reflection['isStatic']) {
                anchor = 'static-' + anchor;
            }

            let anchorRef = anchor;

            if (getMarkdownEngine() === 'bitbucket') {
                let anchorPrefix = '';
                if (reflection.kind === ReflectionKind.ObjectLiteral) {
                    anchorPrefix += 'object-literal-';
                }
                reflection.flags.forEach((flag) => {
                    anchorPrefix += `${flag}-`;
                });
                const prefixRef = getAnchorRef(anchorPrefix);
                const reflectionRef = getAnchorRef(reflection.name);
                anchorRef = `markdown-header-${prefixRef}${reflectionRef}`;
            }

            reflection.url =
                (container.url !== undefined ? container.url : '') +
                '#' +
                anchorRef;
            reflection.anchor = anchor;
            reflection.hasOwnDocument = false;
        }

        reflection.traverse((child: any) => {
            if (child instanceof DeclarationReflection) {
                MarkdownTheme.applyAnchorUrl(child, container);
            }
        });
    }

    constructor(renderer: Renderer, basePath: string, options: any) {
        super(renderer, basePath);

        // remove uneccessary plugins
        renderer.removeComponent('assets');
        renderer.removeComponent('javascript-index');
        renderer.removeComponent('toc');
        renderer.removeComponent('pretty-print');

        // assign global theme service props
        setProps(options, this.resources);

        this.listenTo(renderer, PageEvent.END, this.onRendererBeginPage);
    }

    /**
     * Triggered before a document will be rendered.
     *
     * @param page  An event object describing the current render operation.
     */
    private onRendererBeginPage(page: PageEvent) {
        // const JSON = require('circular-json');
        //  const stringify = require('json-stringify-safe');
        const model = page.model;
        if (model instanceof Reflection) {
            if (getMarkdownEngine() === 'githubWiki') {
                //  console.log(model.name);
                //   fs.writeFileSync(
                //     `./out/${model.name}.json`,
                //   JSON.stringify(model.toObject()),
                //  );
            }
        }
        //  return;

        // if (!(model instanceof Reflection)) {
        //  return;
        // }
    }

    /**
     * Test whether the given path contains a documentation generated by this theme.
     *
     * @param path  The path of the directory that should be tested.
     * @returns     TRUE if the given path seems to be a previous output directory,
     *              otherwise FALSE.
     */
    public isOutputDirectory(outPath: string): boolean {
        const files = fs.readdirSync(outPath);
        return (
            fs.existsSync(path.join(outPath, 'README.md')) ||
            fs.existsSync(path.join(outPath, 'Home.md')) ||
            (files.length === 1 && path.extname(files[0]) === '.md')
        );
    }

    /**
     * Map the models of the given project to the desired output files.
     *
     * @param project  The project whose urls should be generated.
     * @returns        A list of [[UrlMapping]] instances defining which models
     *                 should be rendered to which files.
     */
    public getUrls(project: ProjectReflection): UrlMapping[] {
        const urlMappings: UrlMapping[] = [];
        const entryPoint = this.getEntryPoint(project);

        // write home file with additional context
        urlMappings.push(
            new UrlMapping(
                getMarkdownEngine() === 'githubWiki' ? 'Home.md' : 'README.md',
                {
                    ...entryPoint,
                    ...{
                        displayReadme:
                            this.application.options.getValue('readme') !==
                            'none',
                        isIndex: true,
                        baseHeadingLevel: '##',
                    },
                },
                'reflection.hbs',
            ),
        );

        // write children
        if (entryPoint.children) {
            entryPoint.children.forEach((child: DeclarationReflection) => {
                MarkdownTheme.buildUrls(child, urlMappings);
            });
        }

        // write gitbook summary
        if (getMarkdownEngine() === 'gitbook') {
            const navigationChildren = this.getNavigation(project).children;
            if (navigationChildren) {
                const navigation = navigationChildren.map((navigationItem) => {
                    const dedicatedUrls = navigationItem.dedicatedUrls
                        ? navigationItem.dedicatedUrls.map((url) => {
                              return {
                                  title: () => {
                                      const urlMapping = urlMappings.find(
                                          (item) => {
                                              return item.url === url;
                                          },
                                      );
                                      return urlMapping
                                          ? urlMapping.model.name
                                          : null;
                                  },
                                  url,
                              };
                          })
                        : null;

                    return { ...navigationItem, dedicatedUrls };
                });
                urlMappings.push(
                    new UrlMapping('SUMMARY.md', { navigation }, 'summary.hbs'),
                );
            }
        }
        return urlMappings;
    }

    /**
     * Return a url for the given reflection.
     *
     * @param reflection  The reflection the url should be generated for.
     * @param relative    The parent reflection the url generation should stop on.
     * @param separator   The separator used to generate the url.
     * @returns           The generated url.
     */
    public static getUrl(
        reflection: Reflection,
        relative?: Reflection,
        separator: string = '.',
    ): string {
        let url =
            getMarkdownEngine() === 'githubWiki'
                ? reflection.getAlias().replace(/_/g, '')
                : reflection.getAlias();
        //  url =
        // getMarkdownEngine() === 'githubWiki'
        //  ? url.charAt(0).toUpperCase() + url.slice(1)
        // : url;
        if (
            reflection.parent &&
            reflection.parent !== relative &&
            !(reflection.parent instanceof ProjectReflection)
        ) {
            url =
                MarkdownTheme.getUrl(reflection.parent, relative, separator) +
                separator +
                url;
        }

        return url;
    }
}
