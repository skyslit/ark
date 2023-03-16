import React from 'react';
import { Frontend, ServiceHookOptions, useArkReactServices } from '../index';
import { cloneDeep, debounce, trimEnd } from 'lodash';

function arrayMoveMutable(array: any[], fromIndex: number, toIndex: number) {
  const startIndex = fromIndex < 0 ? array.length + fromIndex : fromIndex;

  if (startIndex >= 0 && startIndex < array.length) {
    const endIndex = toIndex < 0 ? array.length + toIndex : toIndex;

    const [item] = array.splice(fromIndex, 1);
    array.splice(endIndex, 0, item);
  }
}

function arrayMoveImmutable(array: any[], fromIndex: number, toIndex: number) {
  array = [...array];
  arrayMoveMutable(array, fromIndex, toIndex);
  return array;
}

/* -------------------------------------------------------------------------- */
/*                               Utilities Begin                              */
/* -------------------------------------------------------------------------- */

function* infinite(): Generator<string, string, string> {
  let index = 0;
  let timestamp = new Date().valueOf();

  const g = () => `${timestamp}_${index}`;

  while (true) {
    index++;
    yield g();
  }
}

export const generator = infinite();

/* -------------------------------------------------------------------------- */
/*                                Utilities End                               */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                            Type Definition Begin                           */
/* -------------------------------------------------------------------------- */

type DynamicsContentSectionData = {
  id: string;
  sectionTemplateId: string;
  contentMap: {
    [key: string]: any;
  };
};

type DynamicsContentData = {
  domain: string;
  contentKey: string;
  sections: DynamicsContentSectionData[];
};

/* -------------------------------------------------------------------------- */
/*                             Type Definition End                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                          Dynamics Controller Begin                         */
/* -------------------------------------------------------------------------- */

type DynamicsResolverContextType = {
  initialFetchCompleted: boolean;
  renderCounter: number;
  controllerKey: string;
  controller: DynamicsController;
  contents: DynamicsContentData[];
  requestContent: (contentKey: string) => void;
  initialStateLoaded: boolean;
  domain: string;
  updateContent: (
    contentKey: string,
    sections: DynamicsContentSectionData[]
  ) => Promise<boolean>;
};

export type DynamicsDomainContextSet = {
  DynamicsResolverContext: React.Context<DynamicsResolverContextType>;
  SectionManagerContext: React.Context<SectionManagerContextType>;
  ToolboxContext: React.Context<ToolboxContextType>;
  ContentTestRendererContext: React.Context<{
    sectionData: DynamicsContentSectionData;
  }>;
};

export function createDynamicsDomain(): DynamicsDomainContextSet {
  return {
    DynamicsResolverContext: React.createContext<DynamicsResolverContextType>(
      null
    ),
    SectionManagerContext: React.createContext<SectionManagerContextType>(null),
    ToolboxContext: React.createContext<ToolboxContextType>(null),
    ContentTestRendererContext: React.createContext<{
      sectionData: DynamicsContentSectionData;
    }>(null),
  };
}

const defaultDynamicsContext = createDynamicsDomain();

const ComponentResolutionFailure = (props: { componentKey: string }) => {
  const { componentKey } = props;
  return (
    <div data-testid="dynamics:debug:no-ui-message">
      {`'${componentKey}' not defined in DynamicsController UiMap. To hide this message, set debug to 'false' in controller.`}
    </div>
  );
};

type UIMap = {
  AddSectionWidget: () => JSX.Element;
  ErrorUI: () => JSX.Element;
  ContentWrapper: (props: any) => JSX.Element;
  SectionWrapper: (props: {
    sectionData: DynamicsContentSectionData;
    children?: any;
  }) => JSX.Element;
  SectionEditor: (props: {
    templateInfo: SectionTemplateConfiguration;
  }) => JSX.Element;
};

export class DynamicsController {
  debug: boolean = false;
  toolkitUiMap: Partial<UIMap> = {};

  sectionTemplates: Array<SectionTemplateConfiguration> = [];
  loadedContents: Array<DynamicsContentData> = [];
  fetchServiceOptions: Partial<ServiceHookOptions> = {
    serviceId: 'dynamics___fetch-content',
    useRedux: true,
  };

  updateContentServiceOptions: Partial<ServiceHookOptions> = {
    serviceId: 'dynamics___update-content',
    useRedux: true,
  };

  log(msg: any) {
    if (this.debug === true) {
      console.log(msg);
    }
  }

  ToolKitRenderer = (props: {
    uiKey: keyof UIMap;
    children?: any;
    FallbackView?: (props: any) => JSX.Element;
    [key: string]: any;
  }): JSX.Element => {
    const { uiKey } = props;

    const UI = React.useMemo(() => {
      if (Boolean(this.toolkitUiMap[uiKey])) {
        return this.toolkitUiMap[uiKey];
      }

      /**
       * Don't show failure message if the fallback view is available
       */
      if (this.debug === true && !props.FallbackView) {
        return () => <ComponentResolutionFailure componentKey={uiKey} />;
      }

      return null;
    }, [uiKey, props.FallbackView]);

    if (UI) {
      // @ts-ignore
      return <UI {...props} />;
    }

    if (props.FallbackView) {
      return (
        <props.FallbackView {...props}>{props.children}</props.FallbackView>
      );
    }

    return null;
  };
}

/* -------------------------------------------------------------------------- */
/*                          Dynamics Controller Ends                          */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                           React Components Begin                           */
/* -------------------------------------------------------------------------- */

type EnableDynamicsProps = {
  children?: any;
  controllerKey?: string;
  domain: string;
  context?: DynamicsDomainContextSet;
};

function EnableDynamics(props: EnableDynamicsProps) {
  const { children, controllerKey, domain } = props;
  const [renderCounter, setRenderCounter] = React.useState(0);
  const [initialStateLoaded, setInitialStateLoaded] = React.useState(false);
  const ArkReactServices = useArkReactServices();
  const { useDynamicsController, useService } = ArkReactServices.use(Frontend);
  const pendingContentKeysRef = React.useRef<string[]>([]);

  const controller = React.useMemo(() => {
    let _controllerKey = 'default';
    if (typeof controllerKey === 'string') {
      _controllerKey = controllerKey;
    }

    return useDynamicsController(_controllerKey);
  }, [controllerKey]);

  const fetchContentsService = useService({
    ...controller.fetchServiceOptions,
    storePostfix: `${domain}`,
  });
  const updateContentService = useService({
    ...controller.updateContentServiceOptions,
    storePostfix: `${domain}`,
  });

  /**
   * This functions provides a debounce layer,
   * so it will wait for 100ms before making the actual call,
   * so if any new content request gets queued, it again wait for 100ms
   */
  const fetchContents = React.useCallback(
    debounce(() => {
      const keys = [...pendingContentKeysRef.current];
      pendingContentKeysRef.current = [];

      controller.log(`Fetching ${keys.length} key(s)`);

      fetchContentsService
        .invoke(
          {
            domain,
            keys,
          },
          {
            force: true,
          }
        )
        .then(() => {
          controller.log(`Fetched ${keys.length} key(s)`);
        })
        .catch((err) => {
          console.error(err);
        });
    }, 100),
    [domain]
  );

  /**
   * The below code helps to hydrate the controller's loadedContent property with
   * state from ssr evaluation. Hence it is important
   */
  const __ssrFlowAdapter = React.useMemo(() => {
    if (renderCounter === 0 && Boolean(fetchContentsService.response)) {
      controller.loadedContents = [
        ...(controller?.loadedContents || []),
        ...fetchContentsService.response.data,
      ];
    }
  }, [fetchContentsService.response, renderCounter]);

  React.useEffect(() => {
    if (fetchContentsService.response && fetchContentsService.response.data) {
      const itemsToAdd = fetchContentsService.response.data.reduce(
        (acc: any[], item: any) => {
          const existingItem = controller.loadedContents.find(
            (c) => c.contentKey === item.contentKey
          );
          if (!existingItem) {
            acc.push(item);
          }

          return acc;
        },
        []
      );

      controller.loadedContents = [...controller.loadedContents, ...itemsToAdd];

      /**
       * It is required to re-render component, since the actual
       * content is being stored in the controller
       */
      setRenderCounter((c) => c + 1);
    }

    setInitialStateLoaded(true);
  }, [fetchContentsService.response]);

  /**
   * This functions intelligently checks if the content is available in the memory.
   * if not, then it will add it to the API call queue and triggers the fetch content API
   */
  const requestContent = React.useCallback(
    (contentKey: string) => {
      const existingItem = controller.loadedContents.find(
        (c) => c.contentKey === contentKey && c.domain === domain
      );
      if (!existingItem) {
        pendingContentKeysRef.current.push(contentKey);
        fetchContents();
      }
    },
    [fetchContents, domain]
  );

  const updateContent = React.useCallback(
    async (contentKey: string, sections: DynamicsContentSectionData[]) => {
      await updateContentService.invoke(
        {
          domain,
          contentKey,
          sections,
        },
        {
          force: true,
        }
      );

      let content = controller.loadedContents.find(
        (c) => c.domain === domain && c.contentKey === contentKey
      );

      if (!content) {
        content = {
          domain,
          contentKey,
          sections,
        };

        controller.loadedContents.push(content);
      } else {
        content.sections = sections;
      }

      /**
       * It is required to re-render component, since the actual
       * content is being stored in the controller
       */
      setRenderCounter((c) => c + 1);

      return true;
    },
    [domain]
  );

  const ctx: DynamicsResolverContextType = React.useMemo(() => {
    return {
      initialFetchCompleted: renderCounter > 0,
      controllerKey,
      controller,
      contents: controller.loadedContents,
      requestContent,
      initialStateLoaded,
      domain,
      updateContent,
      renderCounter,
    };
  }, [
    controllerKey,
    controller,
    controller.loadedContents,
    initialStateLoaded,
    domain,
    updateContent,
    renderCounter,
  ]);

  const Context = React.useMemo(() => {
    if (props?.context) {
      return props.context.DynamicsResolverContext;
    }

    return defaultDynamicsContext.DynamicsResolverContext;
  }, [props?.context]);

  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}

type SectionManagerContextType = {
  isStaticTemplate: boolean;
  addSection: (templateId: string) => Promise<boolean>;
  removeSection: (sectionId: string) => Promise<boolean>;
  moveSections: (fromIndex: number, toIndex: number) => Promise<boolean>;
  updateSectionContent: (
    sectionId: string,
    contentMap: any
  ) => Promise<boolean>;
  mode: 'view' | 'edit';
  direction: ContentDirections;
  meta: any;
};

const useSectionManager = (
  context?: DynamicsDomainContextSet
): SectionManagerContextType => {
  const manager = React.useContext(
    context?.SectionManagerContext
      ? context.SectionManagerContext
      : defaultDynamicsContext.SectionManagerContext
  );

  if (!manager) {
    throw new Error(
      `useSectionManager cannot be initialised. Make sure that you are passing the context in Content and other areas properly.`
    );
  }

  return manager;
};

type ContentMode = 'view' | 'edit';
type ToolboxContextType = {
  sectionData: DynamicsContentSectionData;
  getPropertyValue: <T = any>(key: string, defaultVal?: T) => T;
  isEditorVisible: boolean;
  setIsEditorVisible: React.Dispatch<React.SetStateAction<boolean>>;
  mode: ContentMode;
  templateProperties: Array<SectionTemplatePropertyType>;
  getContentEditorState: () => { [key: string]: any };
  updateSectionContent: (contentMap: any) => Promise<boolean>;
  currentSectionIndex: number;
  totalNumberOfSections: number;
  isFirstSection: boolean;
  isLastSection: boolean;
  direction: ContentDirections;
  setPreviewContent: (contentMap: any) => void;
};

type ContentDirections = 'vertical' | 'horizontal';
type ContentProps = {
  children?: any;
  contentKey: string;
  mode: ContentMode;
  direction?: ContentDirections;
  meta?: any;
  context?: DynamicsDomainContextSet;
};

function DefaultView(props: any): JSX.Element {
  return <>{props.children}</>;
}

function ContentTestRenderer(props: { context?: DynamicsDomainContextSet }) {
  const SectionManagerContext = React.useMemo(() => {
    if (props?.context) {
      return props.context.SectionManagerContext;
    }

    return defaultDynamicsContext.SectionManagerContext;
  }, [props?.context]);

  const ContentTestRendererContext = React.useMemo(() => {
    if (props?.context) {
      return props.context.ContentTestRendererContext;
    }

    return defaultDynamicsContext.ContentTestRendererContext;
  }, [props?.context]);

  const testRendererContext = React.useContext(ContentTestRendererContext);
  const sectionManager = useSectionManager(props.context);

  if (sectionManager.isStaticTemplate === true) {
    throw new Error(
      `ContentTestRenderer cannot be used with static section template`
    );
  }

  if (!testRendererContext.sectionData) {
    return null;
  }

  return (
    <SectionManagerContext.Provider
      value={{
        ...sectionManager,
        mode: 'view',
      }}
    >
      <SectionRenderer
        mode={'view'}
        sectionData={testRendererContext.sectionData}
        index={0}
        sectionsLength={0}
        direction={sectionManager.direction}
        meta={sectionManager.meta}
        context={props?.context ? props.context : defaultDynamicsContext}
        isStaticContent={false}
      />
    </SectionManagerContext.Provider>
  );
}

function Content(props: ContentProps) {
  const lockContentFetchRef = React.useRef<boolean>(false);
  const { contentKey, mode, direction, meta } = props;

  const isStaticTemplate = React.useMemo(() => {
    return Boolean(props?.children);
  }, [props?.children]);

  const children = React.useMemo(() => {
    if (isStaticTemplate === true) {
      if (Array.isArray(props?.children) === false) {
        return [props?.children];
      }

      return props?.children;
    }

    return [];
  }, [props?.children, isStaticTemplate]);

  const Context = React.useMemo(() => {
    if (props?.context) {
      return props.context.DynamicsResolverContext;
    }

    return defaultDynamicsContext.DynamicsResolverContext;
  }, [props?.context]);

  const dynamicsResolverCtx = React.useContext(Context);

  const _direction = React.useMemo(() => {
    return direction || 'vertical';
  }, [direction]);

  const content: DynamicsContentData = React.useMemo(() => {
    const c = dynamicsResolverCtx.contents.find(
      (c) =>
        c.contentKey === contentKey && c.domain === dynamicsResolverCtx.domain
    );

    /**
     * dynamicsResolverCtx.renderCounter < 1 denotes that, even the initial fetch call is not made yet
     */
    if (c) {
      return c;
    }

    if (dynamicsResolverCtx.renderCounter < 1) {
      return null;
    }

    return {
      contentKey,
      domain: dynamicsResolverCtx.domain,
      sections: [],
      __upserted: true,
    };
  }, [
    dynamicsResolverCtx.contents,
    contentKey,
    dynamicsResolverCtx.renderCounter,
    dynamicsResolverCtx.domain,
  ]);

  React.useEffect(() => {
    /**
     * The below check is required to prevent
     * requesting content before initializing state from ssr
     */
    if (dynamicsResolverCtx.initialStateLoaded) {
      if (
        // @ts-ignore
        (!content || content.__upserted === true) &&
        lockContentFetchRef.current === false
      ) {
        dynamicsResolverCtx.requestContent(contentKey);
        lockContentFetchRef.current = true;
      }
    }
  }, [content, contentKey, dynamicsResolverCtx.initialStateLoaded]);

  const isReady = React.useMemo(() => {
    return Boolean(content) && Array.isArray(content.sections);
  }, [content]);

  const sectionContext = React.useMemo<SectionManagerContextType>(() => {
    return {
      meta,
      isStaticTemplate,
      direction: _direction,
      addSection: async (templateId) => {
        if (isStaticTemplate === true) {
          throw new Error(`You cannot add section when using static template`);
        }
        const templateItem = dynamicsResolverCtx.controller.sectionTemplates.find(
          (t) => t.id === templateId
        );
        if (!templateItem) {
          throw new Error(
            `Template id '${templateId}' not registered in the controller '${dynamicsResolverCtx.controllerKey}'`
          );
        }

        const newSections: DynamicsContentSectionData[] = [
          ...content.sections,
          {
            id: generator.next().value,
            sectionTemplateId: templateId,
            contentMap: {},
          },
        ];

        await dynamicsResolverCtx.updateContent(contentKey, newSections);

        return true;
      },
      moveSections: async (fromIndex: number, toIndex: number) => {
        if (isStaticTemplate === true) {
          throw new Error(
            `You cannot move sections when using static template`
          );
        }

        const newSections = arrayMoveImmutable(
          content.sections,
          fromIndex,
          toIndex
        );
        await dynamicsResolverCtx.updateContent(contentKey, newSections);
        return true;
      },
      removeSection: async (sectionId) => {
        if (isStaticTemplate === true) {
          throw new Error(
            `You cannot remove section when using static template`
          );
        }

        const newSections = content.sections.filter((s) => {
          if (s.id === sectionId) {
            return false;
          }
          return true;
        });

        await dynamicsResolverCtx.updateContent(contentKey, newSections);

        return true;
      },
      updateSectionContent: async (sectionId: string, contentMap: any) => {
        const sectionExists = content.sections.findIndex(
          (s) => s.id === sectionId
        );
        const newSections =
          sectionExists > -1
            ? content.sections.map((s) => {
                if (s.id === sectionId) {
                  return {
                    ...s,
                    contentMap: {
                      ...contentMap,
                    },
                  };
                }
                return s;
              })
            : /** Most likely this to happen with static template */ [
                ...content.sections,
                {
                  id: sectionId,
                  sectionTemplateId: null,
                  contentMap,
                },
              ];

        await dynamicsResolverCtx.updateContent(contentKey, newSections);

        return true;
      },
      mode,
    };
  }, [
    _direction,
    content,
    mode,
    isStaticTemplate,
    dynamicsResolverCtx.domain,
    contentKey,
    dynamicsResolverCtx.controllerKey,
    meta,
  ]);

  const SectionManagerContext = React.useMemo(() => {
    if (props?.context) {
      return props.context.SectionManagerContext;
    }

    return defaultDynamicsContext.SectionManagerContext;
  }, [props?.context]);

  return (
    <SectionManagerContext.Provider value={sectionContext}>
      {isReady === true ? (
        <dynamicsResolverCtx.controller.ToolKitRenderer
          uiKey={'ContentWrapper'}
          FallbackView={DefaultView}
        >
          {isStaticTemplate === false
            ? content.sections
                .filter((s) => Boolean(s.sectionTemplateId))
                .map((s, i) => {
                  return (
                    <SectionRenderer
                      key={s.id}
                      mode={mode}
                      sectionData={s}
                      index={i}
                      sectionsLength={content.sections.length}
                      direction={_direction}
                      meta={meta}
                      context={props.context}
                      isStaticContent={false}
                    />
                  );
                })
            : children.map((child: any, index: number) => {
                const contentKey = child?.props?.contentKey;
                const sectionId = child?.props?.sectionId;
                const properties = child?.props?.properties;
                let sectionData = content.sections.find(
                  (s) => s.id === sectionId
                );

                if (contentKey && sectionId) {
                  return (
                    <SectionRenderer
                      key={`${sectionId}-${index}`}
                      mode={mode}
                      index={index}
                      sectionData={sectionData}
                      sectionsLength={content.sections.length}
                      direction={_direction}
                      meta={meta}
                      context={props.context}
                      isStaticContent={true}
                      child={child}
                    />
                  );
                } else {
                  return child;
                }
              })}
        </dynamicsResolverCtx.controller.ToolKitRenderer>
      ) : null}
      {dynamicsResolverCtx.initialFetchCompleted === true ? (
        <>
          {mode === 'edit' ? (
            <dynamicsResolverCtx.controller.ToolKitRenderer
              uiKey={'AddSectionWidget'}
            />
          ) : null}
        </>
      ) : null}
    </SectionManagerContext.Provider>
  );
}

type SectionRendererProps = {
  mode: ContentMode;
  index: number;
  sectionsLength: number;
  direction: ContentDirections;
  meta: any;
  context: DynamicsDomainContextSet;
  isStaticContent: boolean;
  sectionData?: DynamicsContentSectionData;
  child?: any;
};

function SectionRenderer(props: SectionRendererProps) {
  const {
    isStaticContent,
    mode,
    index,
    sectionsLength,
    direction,
    meta,
  } = props;

  const sectionData: DynamicsContentSectionData = React.useMemo(() => {
    if (props.sectionData) {
      return props.sectionData;
    }

    /** Create new section if does not exists */
    return {
      id: props?.child?.props?.sectionId,
      contentMap: {},
      sectionTemplateId: null,
    };
  }, [props.sectionData, props.child]);

  const staticTemplate: SectionTemplateConfiguration = React.useMemo(() => {
    if (isStaticContent === true) {
      return {
        id: sectionData.id,
        properties: props.child?.props?.properties,
        Template: () => props.child,
      };
    }

    return null;
  }, [isStaticContent, sectionData, props.child]);

  const Context = React.useMemo(() => {
    if (props?.context) {
      return props.context.DynamicsResolverContext;
    }

    return defaultDynamicsContext.DynamicsResolverContext;
  }, [props?.context]);

  const SectionManagerContext = React.useMemo(() => {
    if (props?.context) {
      return props.context.SectionManagerContext;
    }

    return defaultDynamicsContext.SectionManagerContext;
  }, [props?.context]);

  const ToolboxContext = React.useMemo(() => {
    if (props?.context) {
      return props.context.ToolboxContext;
    }

    return defaultDynamicsContext.ToolboxContext;
  }, [props?.context]);

  const ContentTestRendererContext = React.useMemo(() => {
    if (props?.context) {
      return props.context.ContentTestRendererContext;
    }

    return defaultDynamicsContext.ContentTestRendererContext;
  }, [props?.context]);

  const dynamicsResolverCtx = React.useContext(Context);
  const sectionManager = React.useContext(SectionManagerContext);
  const [isEditorVisible, setIsEditorVisible] = React.useState(false);
  const [
    testSectionData,
    setTestSectionData,
  ] = React.useState<DynamicsContentSectionData>(null);

  const template = React.useMemo(() => {
    if (isStaticContent === true) {
      return staticTemplate;
    }

    return dynamicsResolverCtx.controller.sectionTemplates.find(
      (t) => t.id === sectionData.sectionTemplateId
    );
  }, [sectionData, isStaticContent, staticTemplate]);

  const templateProperties = React.useMemo(() => {
    return normaliseProperties(template.properties);
  }, [template.properties]);

  const ctx: ToolboxContextType = React.useMemo(() => {
    const getPropertyValue = (key: string) => {
      const templateInfo = templateProperties.find((t) => t.name === key);
      if (!templateInfo) {
        throw new Error(
          `Looks like you forgot to declare property '${key}' in template '${template.id}'`
        );
      }

      const val = (sectionData?.contentMap || {})[key];
      if (val === undefined) {
        return templateInfo.defValue;
      }

      return val;
    };

    return {
      sectionData,
      getPropertyValue,
      isEditorVisible: mode === 'view' ? false : isEditorVisible,
      setIsEditorVisible,
      mode,
      templateProperties,
      getContentEditorState: () => {
        return templateProperties.reduce<any>((acc, property) => {
          acc[property.name] = getPropertyValue(property.name);
          return acc;
        }, {});
      },
      updateSectionContent: async (contentMap: any) => {
        return sectionManager.updateSectionContent(sectionData.id, contentMap);
      },
      currentSectionIndex: index,
      totalNumberOfSections: sectionsLength,
      isFirstSection: index === 0,
      isLastSection: index === sectionsLength - 1,
      direction,
      meta,
      setPreviewContent: (contentMap) => {
        setTestSectionData({
          ...cloneDeep(sectionData),
          contentMap: {
            ...contentMap,
          },
        });
      },
    };
  }, [
    sectionData,
    isEditorVisible,
    setIsEditorVisible,
    templateProperties,
    template,
    index,
    sectionsLength,
    direction,
    meta,
    mode,
  ]);

  React.useEffect(() => {
    if (isEditorVisible === true) {
      setTestSectionData(cloneDeep(sectionData));
    }
  }, [isEditorVisible]);

  if (!template) {
    return <dynamicsResolverCtx.controller.ToolKitRenderer uiKey="ErrorUI" />;
  }

  return (
    <ToolboxContext.Provider value={ctx}>
      <ContentTestRendererContext.Provider
        value={{
          sectionData: testSectionData,
        }}
      >
        <dynamicsResolverCtx.controller.ToolKitRenderer
          uiKey="SectionWrapper"
          sectionData={sectionData}
          FallbackView={DefaultView}
        >
          <template.Template />
        </dynamicsResolverCtx.controller.ToolKitRenderer>
        {mode === 'edit' ? (
          <dynamicsResolverCtx.controller.ToolKitRenderer
            uiKey="SectionEditor"
            templateInfo={template}
          />
        ) : null}
      </ContentTestRendererContext.Provider>
    </ToolboxContext.Provider>
  );
}

const useToolbox = (context?: DynamicsDomainContextSet): ToolboxContextType => {
  const toolbox = React.useContext(
    context?.ToolboxContext
      ? context.ToolboxContext
      : defaultDynamicsContext.ToolboxContext
  );

  if (!toolbox) {
    throw new Error(
      `useToolbox cannot be initialised. Make sure that you are passing the context in Content and other areas properly.`
    );
  }

  return toolbox;
};

/* -------------------------------------------------------------------------- */
/*                            React Component Ends                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                         Template Management Begins                         */
/* -------------------------------------------------------------------------- */

type SectionTemplatePropertyType = {
  name: string;
  type?: string;
  defValue?: any;
  meta?: any;
};

type SectionTemplateConfiguration = {
  id: string;
  properties: Array<string | SectionTemplatePropertyType>;
  Template: (props: any) => JSX.Element;
};

function normaliseProperties(
  input: Array<string | SectionTemplatePropertyType>
): SectionTemplatePropertyType[] {
  return input.map((i) => {
    if (typeof i === 'string') {
      return {
        name: i,
        type: 'default',
      };
    }

    return {
      type: 'default',
      ...i,
    };
  });
}

function createSectionTemplate(
  args: SectionTemplateConfiguration
): SectionTemplateConfiguration {
  return args;
}

/* -------------------------------------------------------------------------- */
/*                          Template Management Ends                          */
/* -------------------------------------------------------------------------- */

export default {
  EnableDynamics,
  Content,
  createSectionTemplate,
  useToolbox,
  useSectionManager,
  ContentTestRenderer,
  createDynamicsDomain,
};
