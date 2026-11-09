/**
 * A minimal expo-router for the preview runtime: file-based routes (from the shared route
 * model in @appbuilder/contract), Stack and Tabs navigators, Link, router, and params.
 *
 * Deliberate v0 limits: screens below the top of a stack are unmounted (their state resets
 * on back), no transition animations, no nested navigators inside a tab, no modals.
 */
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, Text, View } from "react-native";
import {
  hrefFor,
  matchRoute,
  normalizeHref,
  splitHref,
  type LayoutRoute,
  type RouteMatch,
  type RouteNode,
} from "@appbuilder/contract";
import { Ionicons } from "./vector-icons";
import { useSafeAreaInsets } from "./safe-area";

type Href = string | { pathname: string; params?: Record<string, string | number> };
type Options = Record<string, unknown>;
type ScreenOptionsProp = Options | ((args: { route: { name: string } }) => Options);
type NavAction = "push" | "replace" | "back" | "navigate";

// --- Navigation store --------------------------------------------------------------------

interface NavigationConfig {
  tree: LayoutRoute;
  mode: "app" | "screen";
  initialHref: string;
  onNavigated?: (href: string) => void;
  /** Screen mode: the frame never navigates itself; it asks the parent instead. */
  onRequest?: (href: string, action: NavAction) => void;
}

class Navigation {
  history: string[];
  private listeners = new Set<() => void>();

  constructor(readonly config: NavigationConfig) {
    this.history = [config.initialHref];
  }

  current = (): string => this.history[this.history.length - 1]!;
  canGoBack = (): boolean => this.history.length > 1;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: string[]) {
    this.history = next;
    this.listeners.forEach((l) => l());
    this.config.onNavigated?.(this.current());
  }

  private intercept(href: string, action: NavAction): boolean {
    if (this.config.mode !== "screen") return false;
    this.config.onRequest?.(href, action);
    return true;
  }

  push(href: Href) {
    const target = normalizeHref(href);
    if (!this.intercept(target, "push")) this.commit([...this.history, target]);
  }

  replace(href: Href) {
    const target = normalizeHref(href);
    if (!this.intercept(target, "replace")) this.commit([...this.history.slice(0, -1), target]);
  }

  back() {
    if (this.intercept("", "back")) return;
    if (this.canGoBack()) this.commit(this.history.slice(0, -1));
  }

  /** Switching between siblings of the same tab navigator replaces; anything else pushes. */
  navigate(href: Href) {
    const target = normalizeHref(href);
    if (this.intercept(target, "navigate")) return;
    const from = matchRoute(this.config.tree, this.current());
    const to = matchRoute(this.config.tree, target);
    const sameTabs =
      from && to && sharedTabsLayout(from, to) !== null && from.screen.file !== to.screen.file;
    if (sameTabs) this.commit([...this.history.slice(0, -1), target]);
    else if (target !== this.current()) this.commit([...this.history, target]);
  }
}

function sharedTabsLayout(a: RouteMatch, b: RouteMatch): LayoutRoute | null {
  const lastA = a.layouts[a.layouts.length - 1];
  const lastB = b.layouts[b.layouts.length - 1];
  return lastA && lastA === lastB && lastA.name !== "" ? lastA : null;
}

let navigation: Navigation | null = null;

function nav(): Navigation {
  if (!navigation)
    throw new Error("expo-router shim used before the preview runtime configured it");
  return navigation;
}

export function configureNavigation(config: NavigationConfig): Navigation {
  navigation = new Navigation(config);
  return navigation;
}

export function getNavigation(): Navigation | null {
  return navigation;
}

// --- Public expo-router API ----------------------------------------------------------------

export const router = {
  push: (href: Href) => nav().push(href),
  replace: (href: Href) => nav().replace(href),
  navigate: (href: Href) => nav().navigate(href),
  back: () => nav().back(),
  canGoBack: () => nav().canGoBack(),
  dismiss: () => nav().back(),
  setParams: () => {},
};

export function useRouter() {
  return router;
}

const ScreenContext = createContext<{ params: Record<string, string>; href: string }>({
  params: {},
  href: "/",
});

export function useLocalSearchParams<
  T extends Record<string, string> = Record<string, string>,
>(): T {
  return useContext(ScreenContext).params as T;
}
export const useGlobalSearchParams = useLocalSearchParams;

export function usePathname(): string {
  return splitHref(useContext(ScreenContext).href).pathname;
}

export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(effect, [effect]);
}

export function Redirect({ href }: { href: Href }) {
  useEffect(() => nav().replace(href), [href]);
  return null;
}

export function Link({
  href,
  asChild,
  replace,
  push,
  children,
  onPress,
  ...rest
}: {
  href: Href;
  asChild?: boolean;
  replace?: boolean;
  push?: boolean;
  children?: ReactNode;
  onPress?: (event: unknown) => void;
  [key: string]: unknown;
}) {
  const handlePress = (event: unknown) => {
    onPress?.(event);
    if (replace) nav().replace(href);
    else if (push) nav().push(href);
    else nav().navigate(href);
  };
  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ onPress?: (e: unknown) => void }>, {
      onPress: handlePress,
    });
  }
  return (
    <Text {...rest} onPress={handlePress} accessibilityRole="link">
      {children}
    </Text>
  );
}

// --- Rendering the matched route ---------------------------------------------------------

type RequireModule = (file: string) => { default?: ComponentType };

interface LevelInfo {
  layout: LayoutRoute;
  /** Name of the active child of this layout (screen or nested layout). */
  childName: string;
  /** Identity of the active child, used to scope options set from inside a screen. */
  childKey: string;
  renderChild: () => ReactNode;
}

const LevelContext = createContext<LevelInfo | null>(null);

interface NavigatorHandle {
  setOptions: (childKey: string, options: Options) => void;
  childKey: string;
}
const NavigatorContext = createContext<NavigatorHandle | null>(null);

export function RouterRoot({
  tree,
  requireModule,
}: {
  tree: LayoutRoute;
  requireModule: RequireModule;
}) {
  const navigationStore = nav();
  const href = useSyncExternalStore(navigationStore.subscribe, navigationStore.current);
  const match = useMemo(() => matchRoute(tree, href), [tree, href]);
  if (!match) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>No screen matches {href}</Text>
      </View>
    );
  }
  return <Level match={match} index={0} href={href} requireModule={requireModule} />;
}

function Level({
  match,
  index,
  href,
  requireModule,
}: {
  match: RouteMatch;
  index: number;
  href: string;
  requireModule: RequireModule;
}) {
  const layout = match.layouts[index]!;
  const isLast = index === match.layouts.length - 1;
  const child: RouteNode = isLast ? match.screen : match.layouts[index + 1]!;
  const childKey = isLast ? href : child.name;

  const renderChild = () =>
    isLast ? (
      <ScreenContext.Provider value={{ params: match.params, href }}>
        <Screen key={href} file={match.screen.file} requireModule={requireModule} />
      </ScreenContext.Provider>
    ) : (
      <Level match={match} index={index + 1} href={href} requireModule={requireModule} />
    );

  const LayoutComponent = layout.file ? requireModule(layout.file).default : DefaultLayout;
  if (!LayoutComponent) throw new Error(`${layout.file} has no default export`);

  return (
    <LevelContext.Provider value={{ layout, childName: child.name, childKey, renderChild }}>
      <LayoutComponent />
    </LevelContext.Provider>
  );
}

function DefaultLayout() {
  return <Stack />;
}

function Screen({ file, requireModule }: { file: string; requireModule: RequireModule }) {
  const Component = requireModule(file).default;
  if (!Component) throw new Error(`${file} has no default export`);
  return <Component />;
}

function useLevel(): LevelInfo {
  const level = useContext(LevelContext);
  if (!level) throw new Error("Navigators must be rendered by a _layout file");
  return level;
}

/** Collect `<X.Screen name options />` declarations from a navigator's children, in order. */
function declaredScreens(children: ReactNode): Array<{ name: string; options: Options }> {
  const out: Array<{ name: string; options: Options }> = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { name?: string; options?: Options };
    if (typeof props.name === "string")
      out.push({ name: props.name, options: props.options ?? {} });
  });
  return out;
}

function resolveScreenOptions(screenOptions: ScreenOptionsProp | undefined, name: string): Options {
  if (!screenOptions) return {};
  return typeof screenOptions === "function" ? screenOptions({ route: { name } }) : screenOptions;
}

function useDynamicOptions() {
  const [dynamic, setDynamic] = useState<Record<string, Options>>({});
  const setOptions = useCallback((childKey: string, options: Options) => {
    setDynamic((previous) => {
      const before = previous[childKey];
      if (before && JSON.stringify(before) === JSON.stringify(options)) return previous;
      return { ...previous, [childKey]: options };
    });
  }, []);
  return [dynamic, setOptions] as const;
}

function titleFromName(name: string): string {
  const base = name.split("/").pop() ?? name;
  if (base === "index") return "Home";
  return base
    .replace(/^\[|\]$/g, "")
    .replace(/[-_]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function Header({
  options,
  title,
  canGoBack,
}: {
  options: Options;
  title: string;
  canGoBack: boolean;
}) {
  const insets = useSafeAreaInsets();
  const headerStyle = (options.headerStyle as object) ?? {};
  const tint = (options.headerTintColor as string) ?? "#111";
  return (
    <View
      style={[
        {
          paddingTop: insets.top,
          height: insets.top + 52,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          backgroundColor: "#fff",
        },
        headerStyle,
      ]}
    >
      <View style={{ width: 64 }}>
        {canGoBack ? (
          <Pressable accessibilityLabel="Back" onPress={() => nav().back()} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={24} color={tint} />
          </Pressable>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", color: tint }}
      >
        {title}
      </Text>
      <View style={{ width: 64 }} />
    </View>
  );
}

function StackNavigator({
  screenOptions,
  children,
}: {
  screenOptions?: ScreenOptionsProp;
  children?: ReactNode;
}) {
  const level = useLevel();
  const [dynamic, setOptions] = useDynamicOptions();
  const declared = declaredScreens(children).find((s) => s.name === level.childName)?.options ?? {};
  const options: Options = {
    ...resolveScreenOptions(screenOptions, level.childName),
    ...declared,
    ...dynamic[level.childKey],
  };
  const headerShown = options.headerShown !== false;
  const title = (options.title as string) ?? titleFromName(level.childName);

  return (
    <NavigatorContext.Provider value={{ setOptions, childKey: level.childKey }}>
      <View style={{ flex: 1 }}>
        {headerShown ? (
          <Header options={options} title={title} canGoBack={nav().canGoBack()} />
        ) : null}
        <View style={[{ flex: 1 }, options.contentStyle as object]}>{level.renderChild()}</View>
      </View>
    </NavigatorContext.Provider>
  );
}

function TabsNavigator({
  screenOptions,
  children,
}: {
  screenOptions?: ScreenOptionsProp;
  children?: ReactNode;
}) {
  const level = useLevel();
  const insets = useSafeAreaInsets();
  const [dynamic, setOptions] = useDynamicOptions();
  const declared = declaredScreens(children);

  const optionsFor = (name: string): Options => ({
    ...resolveScreenOptions(screenOptions, name),
    ...declared.find((s) => s.name === name)?.options,
  });

  // Declared order first, then any undeclared children; `href: null` hides a tab.
  const ordered = [
    ...declared.map((d) => level.layout.children.find((c) => c.name === d.name)).filter(Boolean),
    ...level.layout.children.filter((c) => !declared.some((d) => d.name === c.name)),
  ] as RouteNode[];
  const tabs = ordered.filter((c) => optionsFor(c.name).href !== null);

  const active = { ...optionsFor(level.childName), ...dynamic[level.childKey] };
  const headerShown = active.headerShown !== false;

  return (
    <NavigatorContext.Provider value={{ setOptions, childKey: level.childKey }}>
      <View style={{ flex: 1 }}>
        {headerShown ? (
          <Header
            options={active}
            title={(active.title as string) ?? titleFromName(level.childName)}
            canGoBack={false}
          />
        ) : null}
        <View style={{ flex: 1 }}>{level.renderChild()}</View>
        <View
          style={[
            {
              flexDirection: "row",
              borderTopWidth: 1,
              borderTopColor: "#e5e5e5",
              backgroundColor: "#fff",
              paddingBottom: insets.bottom,
              paddingTop: 6,
            },
            active.tabBarStyle as object,
          ]}
        >
          {tabs.map((tab) => {
            const options = optionsFor(tab.name);
            const focused = tab.name === level.childName;
            const color = focused
              ? ((options.tabBarActiveTintColor as string) ?? "#007aff")
              : ((options.tabBarInactiveTintColor as string) ?? "#8e8e93");
            const icon = options.tabBarIcon as
              ((args: { color: string; size: number; focused: boolean }) => ReactNode) | undefined;
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                onPress={() => nav().navigate(firstHref(tab))}
                style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 4 }}
              >
                {icon ? icon({ color, size: 24, focused }) : null}
                <Text style={{ color, fontSize: 11, fontWeight: "500" }}>
                  {(options.title as string) ?? titleFromName(tab.name)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </NavigatorContext.Provider>
  );
}

function firstHref(node: RouteNode): string {
  if (node.kind === "screen") return hrefFor(node);
  const first = node.children[0];
  return first ? firstHref(first) : "/";
}

/**
 * `<Stack.Screen name="x" options />` inside a navigator is a declaration (read by the
 * navigator, never rendered). Rendered inside a screen without `name`, it sets that
 * screen's options on the nearest navigator, like expo-router.
 */
function ScreenOptions({ options }: { name?: string; options?: Options }) {
  const navigator = useContext(NavigatorContext);
  const latest = useRef(options);
  latest.current = options;
  const serialized = JSON.stringify(options ?? {});
  useEffect(() => {
    if (navigator && latest.current) navigator.setOptions(navigator.childKey, latest.current);
  }, [navigator, serialized]);
  return null;
}

export const Stack = Object.assign(StackNavigator, { Screen: ScreenOptions });
export const Tabs = Object.assign(TabsNavigator, { Screen: ScreenOptions });
export const Slot = function Slot() {
  return <>{useLevel().renderChild()}</>;
};
