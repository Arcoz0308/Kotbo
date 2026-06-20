<script lang="ts">
  import { onMount } from "svelte";
  import { Route as RouteLegacy, router } from "tinro";
  const Route = RouteLegacy as any;
  import MainLayout from "./lib/components/MainLayout.svelte";
  import { authStore } from "./lib/stores/auth.svelte";
  import { dashboardStore } from "./lib/stores/dashboard.svelte";
  import { themeStore } from "./lib/stores/theme.svelte";
  import { toast } from "./lib/stores/toast.svelte";
  import ToastContainer from "./lib/components/ToastContainer.svelte";
  import InviteDetailsModal from "./lib/components/invitations/InviteDetailsModal.svelte";
  import FeedbackModal from "./lib/components/FeedbackModal.svelte";
  import CommandPalette from "./lib/components/CommandPalette.svelte";
  import KeyboardShortcutsModal from "./lib/components/KeyboardShortcutsModal.svelte";
  import NotFound from "./pages/NotFound.svelte";
  import GlobalErrorOverlay from "./lib/components/GlobalErrorOverlay.svelte";

  let globalError = $state<{ message: string; stack?: string } | null>(null);
  let showKeyboardShortcuts = $state(false);

  import Login from "./pages/Login.svelte";
  import Activation from "./pages/Activation.svelte";
  import Overview from "./pages/Overview.svelte";
  import Analytics from "./pages/Analytics.svelte";
  import ModuleCatalog from "./pages/ModuleCatalog.svelte";

  import ActivityLog from "./pages/ActivityLog.svelte";
  import Logs from "./pages/Logs.svelte";
  import NotificationsSettings from "./pages/NotificationsSettings.svelte";
  import CommandAccess from "./pages/CommandAccess.svelte";
  import Sanctions from "./pages/Sanctions.svelte";
  import Detections from "./pages/Detections.svelte";
  import Regulation from "./pages/Regulation.svelte";
  import News from "./pages/News.svelte";
  import SocialNetworks from "./pages/SocialNetworks.svelte";
  import AdminLayout from "./lib/components/AdminLayout.svelte";
  import AdminOverview from "./pages/admin/Overview.svelte";
  import AdminServers from "./pages/admin/Servers.svelte";
  import AdminShards from "./pages/admin/Shards.svelte";
  import AdminSecurity from "./pages/admin/Security.svelte";
  import AdminContent from "./pages/admin/Content.svelte";
  import AdminConfig from "./pages/admin/Config.svelte";
  import AdminActivation from "./pages/admin/Activation.svelte";
  import AdminModules from "./pages/admin/Modules.svelte";
  import Profile from "./pages/Profile.svelte";
  import PublicProfile from "./pages/PublicProfile.svelte";
  import StaffManagement from "./pages/StaffManagement.svelte";
  import Members from "./pages/Members.svelte";
  import Recruitment from "./pages/Recruitment.svelte";
  import RecruitmentForms from "./pages/RecruitmentForms.svelte";
  import FormBuilder from "./pages/FormBuilder.svelte";
  import FormResponses from "./pages/FormResponses.svelte";
  import CustomForms from "./pages/CustomForms.svelte";
  import CustomFormResponses from "./pages/CustomFormResponses.svelte";
  import PublicForm from "./pages/PublicForm.svelte";
  import Planning from "./pages/Planning.svelte";
  import Inbox from "./pages/Inbox.svelte";
  import Tutoring from "./pages/Tutoring.svelte";
  import DoubleAccounts from "./pages/DoubleAccounts.svelte";
  import NicknameModeration from "./pages/NicknameModeration.svelte";
  import ChannelsManagement from "./pages/ChannelsManagement.svelte";
  import GeneralSettings from "./pages/GeneralSettings.svelte";
  import DailyAlgo from "./pages/DailyAlgo.svelte";
  import DailyAlgoIDE from "./pages/DailyAlgoIDE.svelte";
  import Events from "./pages/Events.svelte";
  import EventEditor from "./pages/EventEditor.svelte";
  import EventControl from "./pages/EventControl.svelte";
  import Invitations from "./pages/Invitations.svelte";
  import InvitationDetail from "./pages/InvitationDetail.svelte";
  import Tickets from "./pages/Tickets.svelte";
  import TranscriptDetail from "./pages/TranscriptDetail.svelte";

  import Leveling from "./pages/Leveling.svelte";
  import LevelingPublic from "./pages/LevelingPublic.svelte";
  import Economy from "./pages/Economy.svelte";
  import Giveaways from "./pages/Giveaways.svelte";
  import Announcement from "./pages/Announcement.svelte";
  import ReactionRoles from "./pages/ReactionRoles.svelte";
  import AutoResponses from "./pages/Triggers.svelte";
  import AutoMod from "./pages/AutoMod.svelte";
  import Suggestions from "./pages/Suggestions.svelte";
  import EmbedBuilder from "./pages/EmbedBuilder.svelte";
  import UserSettings from "./pages/UserSettings.svelte";
  import Backups from "./pages/Backups.svelte";
  import Schedules from "./pages/Schedules.svelte";
  import FunSettings from "./pages/FunSettings.svelte";

  const isPublicPage = $derived(
    /^\/\d{17,19}\/news\/?$/.test($router.path) ||
      /^\/\d{17,19}\/leveling\/classement\/?$/.test($router.path) ||
      ($router.path.startsWith("/profile/") && !authStore.isAuthenticated) ||
      $router.path.startsWith("/transcripts/") ||
      $router.path.startsWith("/form/"),
  );

  const featureAccess = $derived(dashboardStore.state.featureAccess || {});
  const fallbackCanView = $derived(
    authStore.guilds.find((guild) => guild.id === authStore.selectedGuildId)
      ?.accessLevel !== "none",
  );

  function canViewFeature(featureKey: string) {
    if (!featureKey) return true;
    const feature = (featureAccess as Record<string, any>)?.[featureKey];
    if (feature?.canView !== undefined) return feature.canView;
    return fallbackCanView;
  }

  function resolveRouteFeatureKey(path: string): string | null {
    if (path === "/" || path.startsWith("/profile")) return "dashboard";
    if (path.startsWith("/analytics")) return "analytics";
    if (path.startsWith("/inbox")) return "inbox";
    if (path.startsWith("/dailyalgo")) return "daily_algo";
    if (path.startsWith("/events")) return "events";
    if (path.startsWith("/members") || path.startsWith("/invitations"))
      return "members";
    if (path.startsWith("/sanctions")) return "sanctions";
    if (path.startsWith("/nickname-moderation")) return "nickname_moderation";
    if (path.startsWith("/channels-management")) return "auto_thread";
    if (path.startsWith("/detections")) return "double_accounts";
    if (path.startsWith("/double-accounts")) return "double_accounts";
    if (path.startsWith("/logs")) return "logs";
    if (path.startsWith("/activity")) return "activity";
    if (path.startsWith("/recruitment")) return "recruitment";
    if (path.startsWith("/recruitment-forms")) return "recruitment";
    if (path.startsWith("/tickets")) return "tickets";
    if (path.startsWith("/tutoring")) return "tutoring";
    if (path.startsWith("/meetings")) return "absences";
    if (path.startsWith("/absences")) return "absences";
    if (path.startsWith("/planning")) return "absences";
    if (path.startsWith("/leveling")) return "leveling";
    if (path.startsWith("/economy")) return "economy";
    if (path.startsWith("/giveaways")) return "giveaways";
    if (path.startsWith("/welcome") || path.startsWith("/announcement")) return "welcome_goodbye";
    if (path.startsWith("/reaction-roles")) return "reaction_roles";
    if (path.startsWith("/triggers")) return "auto_responses";
    if (path.startsWith("/automod")) return "automod";
    if (path.startsWith("/suggestions")) return "suggestions";
    if (path.startsWith("/embed-builder")) return "embed_builder";
    if (path.startsWith("/staff-management")) {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab === "roles") return "staff_roles";
      if (tab === "polls") return "polls";
      if (tab === "warnings") return "discipline";
      if (tab === "leadership") return "staff_directory";
      return "staff_directory";
    }
    if (path.startsWith("/modules")) return "modules";
    if (path.startsWith("/command-access")) return "commands";
    if (path.startsWith("/settings")) return "settings";
    if (path.startsWith("/regulation")) return "regulation";
    if (path.startsWith("/news")) return "news";
    if (path.startsWith("/social-networks")) return "social_networks";
    if (path.startsWith("/backups")) return "settings";
    if (path.startsWith("/schedules")) return "settings";
    if (path.startsWith("/fun")) return "fun";
    if (path.startsWith("/admin")) return "centralized_config";
    return null;
  }

  function navigate(node: HTMLElement, path: string) {
    router.goto(path);
  }

  function selectedGuildAccessLevel() {
    const selectedGuild = authStore.guilds.find(
      (guild) => guild.id === authStore.selectedGuildId,
    );
    return selectedGuild?.accessLevel || "admin";
  }

  const canManageSettings = $derived(
    selectedGuildAccessLevel() !== "moderator",
  );

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get("token");

    if (!token && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      token = hashParams.get("token");
    }

    if (token) {
      authStore.setToken(token);

      window.history.replaceState({}, document.title, window.location.pathname);
      router.goto("/");
    }

    if (
      !authStore.isAuthenticated &&
      $router.path !== "/login" &&
      !isPublicPage
    ) {
      router.goto("/login");
    }

    const timer = setTimeout(() => {
      sessionStorage.removeItem("error_refreshed");
    }, 5000);

    // Keyboard shortcuts
    let gKeyPressed = false;
    let gKeyTimeout: number | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl + Shift + key combinations
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'd':
            e.preventDefault();
            router.goto("/");
            break;
          case 'm':
            e.preventDefault();
            router.goto("/members");
            break;
          case 'c':
            e.preventDefault();
            router.goto("/settings");
            break;
          case 'l':
            e.preventDefault();
            router.goto("/activity");
            break;
          case 'n':
            e.preventDefault();
            showKeyboardShortcuts = true;
            break;
        }
        return;
      }

      // Handle G then key sequences
      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        gKeyPressed = true;
        if (gKeyTimeout) clearTimeout(gKeyTimeout);
        gKeyTimeout = window.setTimeout(() => {
          gKeyPressed = false;
        }, 1000);
        return;
      }

      if (gKeyPressed) {
        switch (e.key.toLowerCase()) {
          case 'd':
            e.preventDefault();
            router.goto("/");
            gKeyPressed = false;
            if (gKeyTimeout) clearTimeout(gKeyTimeout);
            break;
          case 'm':
            e.preventDefault();
            router.goto("/members");
            gKeyPressed = false;
            if (gKeyTimeout) clearTimeout(gKeyTimeout);
            break;
          case 'c':
            e.preventDefault();
            router.goto("/settings");
            gKeyPressed = false;
            if (gKeyTimeout) clearTimeout(gKeyTimeout);
            break;
          case 'l':
            e.preventDefault();
            router.goto("/activity");
            gKeyPressed = false;
            if (gKeyTimeout) clearTimeout(gKeyTimeout);
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-keyboard-shortcuts", () => {
      showKeyboardShortcuts = true;
    });

    // Global error handling — ignores network/abort errors from WS reconnections
    // and Vite dev-server internal errors to avoid infinite feedback loops
    const IGNORED_MESSAGES = [
      "Failed to fetch",
      "NetworkError",
      "Load failed",
      "AbortError",
      "The operation was aborted",
      // Vite dev-server WS errors (would cause infinite loop if logged via console)
      "send was called before connect",
      "WebSocket is closed",
    ];

    // Re-entrancy guard: prevents the handler from triggering itself
    let isHandlingRejection = false;

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isHandlingRejection) {
        event.preventDefault();
        return;
      }

      const reason = event.reason;
      const message: string = reason?.message || String(reason) || "";

      // Silently ignore network errors (e.g. from WS reconnect / API temporarily down)
      if (IGNORED_MESSAGES.some((ignored) => message.includes(ignored))) {
        event.preventDefault(); // Suppress browser console error too
        return;
      }

      isHandlingRejection = true;
      try {
        // Use queueMicrotask to avoid calling toast synchronously during Vite init
        queueMicrotask(() => {
          globalError = {
            message:
              message ||
              "Une erreur inattendue est survenue (Promesse rejetée)",
            stack: reason?.stack || undefined,
          };
          toast.error(message || "Une erreur inattendue est survenue");
          isHandlingRejection = false;
        });
      } catch {
        isHandlingRejection = false;
      }
    };

    const handleError = (event: ErrorEvent) => {
      // Only show toast for non-script-load errors
      if (
        event.message &&
        !IGNORED_MESSAGES.some((m) => event.message.includes(m))
      ) {
        globalError = {
          message: event.message || "Une erreur est survenue",
          stack: event.error?.stack || undefined,
        };
        toast.error(event.message || "Une erreur est survenue");
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-keyboard-shortcuts", () => {
        showKeyboardShortcuts = true;
      });
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  });

  $effect(() => {
    if (
      !authStore.isAuthenticated &&
      $router.path !== "/login" &&
      !isPublicPage
    ) {
      router.goto("/login");
      return;
    }

    if (authStore.isAuthenticated && !isPublicPage) {
      const featureKey = resolveRouteFeatureKey($router.path);
      if (featureKey && !canViewFeature(featureKey)) {
        if ($router.path !== "/") {
          router.goto("/");
        }
      }
    }
  });
</script>

{#snippet handleLegacyRedirect(moduleId: string)}
  {@const mapping: Record<string, string> = {
    'regulation': '/regulation',
    'sanctions': '/sanctions',
    'logs': '/logs',
    'recruitment': '/recruitment',
    'tickets': '/tickets',
    'meetings': '/planning',
    'fun': '/fun',
    'dailyalgo': $router.query.submissionId ? `/dailyalgo/ide?submissionId=${$router.query.submissionId}` : '/dailyalgo'
  }}
  {@const target = mapping[moduleId] || "/modules"}
  <div use:navigate={target}></div>
{/snippet}

{#if globalError}
  <GlobalErrorOverlay
    errorMsg={globalError.message}
    errorStack={globalError.stack}
  />
{:else}
  <svelte:boundary>
    {#if isPublicPage}
      <Route path="/:serverId/news" let:meta>
        <News serverId={meta.params.serverId} />
      </Route>
      <Route path="/:serverId/leveling/classement" let:meta>
        <LevelingPublic serverId={meta.params.serverId} />
      </Route>
      <Route path="/profile/:userId" let:meta>
        <PublicProfile userId={meta.params.userId} />
      </Route>
      <Route path="/transcripts/:transcriptId" let:meta>
        <TranscriptDetail transcriptId={meta.params.transcriptId} />
      </Route>
      <Route path="/form/:formId" let:meta>
        <PublicForm formId={meta.params.formId} />
      </Route>

      <Route path="/analytics">
        <Analytics />
      </Route>
      <Route path="/activity">
        <ActivityLog />
      </Route>
      {#if authStore.isBotAdmin}
        <Route path="/admin">
          <AdminOverview />
        </Route>
        <Route path="/admin/servers">
          <AdminServers />
        </Route>
        <Route path="/admin/shards">
          <AdminShards />
        </Route>
        <Route path="/admin/security">
          <AdminSecurity />
        </Route>
        <Route path="/admin/content">
          <AdminContent />
        </Route>
        <Route path="/admin/config">
          <AdminConfig />
        </Route>
        <Route path="/admin/activation">
          <AdminActivation />
        </Route>
        <Route path="/admin/modules">
          <AdminModules />
        </Route>
      {/if}
      <Route path="/logs">
        <Logs />
      </Route>
      <Route path="/sanctions">
        <Sanctions />
      </Route>
      <Route path="/detections">
        <Detections />
      </Route>
      <Route path="/regulation">
        <Regulation />
      </Route>
      <Route path="/profile">
        <Profile />
      </Route>
      {#if canManageSettings}
        <Route path="/modules">
          <ModuleCatalog />
        </Route>
        <Route path="/module-settings/:moduleId" let:meta>
          <!-- Simple redirect logic for legacy URLs -->
          {@render handleLegacyRedirect(meta.params.moduleId)}
        </Route>
        <Route path="/notifications">
          <NotificationsSettings />
        </Route>
        <Route path="/command-access">
          <CommandAccess />
        </Route>
        <Route path="/settings">
          <GeneralSettings />
        </Route>
        <Route path="/automations">
          <ModuleCatalog />
        </Route>
        <Route path="/staff-management">
          <StaffManagement />
        </Route>
        <Route path="/channels-management">
          <ChannelsManagement />
        </Route>
      {/if}

      <Route path="/dailyalgo">
        <DailyAlgo />
      </Route>
      <Route path="/members/*">
        <Members />
      </Route>
      <Route path="/recruitment">
        <Recruitment />
      </Route>
      <Route path="/tickets">
        <Tickets />
      </Route>
      <Route path="/meetings">
        <div use:navigate={"/planning"}></div>
      </Route>
      <Route path="/absences">
        <div use:navigate={"/planning"}></div>
      </Route>
      <Route path="/planning">
        <Planning />
      </Route>
      <Route path="/inbox">
        <Inbox />
      </Route>
      <Route path="/tutoring">
        <Tutoring />
      </Route>
      <Route path="/double-accounts">
        <DoubleAccounts />
      </Route>
      <Route path="/invitations">
        <Invitations />
      </Route>
      <Route path="/invitations/:code" let:meta>
        {#key meta.params.code}
          <InvitationDetail code={meta.params.code} />
        {/key}
      </Route>

      <Route path="/backups">
        <Backups />
      </Route>
      <Route path="/schedules">
        <Schedules />
      </Route>


      <Route path="/events">
        <Events />
      </Route>
      <Route path="/events/edit/:eventId" let:meta>
        <EventEditor eventId={meta.params.eventId} />
      </Route>
      <Route path="/events/control/:eventId" let:meta>
        <EventControl eventId={meta.params.eventId} />
      </Route>

      <Route path="/userSettings">
        <UserSettings />
      </Route>

      <!-- Fallback for authenticated users -->
      <Route fallback>
        <NotFound />
      </Route>
    {:else}
      <Route path="/login">
        <Login />
      </Route>

      {#if authStore.isAuthenticated}
        {#if dashboardStore.state.error === "activation_requise"}
          <Route path="/*">
            <Activation />
          </Route>
        {:else if $router.path === "/dailyalgo/ide"}
          <Route path="/dailyalgo/ide">
            <DailyAlgoIDE />
          </Route>
        {:else}
          <MainLayout>
            <Route path="/">
              <Overview />
            </Route>

            <Route path="/analytics">
              <Analytics />
            </Route>
            <Route path="/activity">
              <ActivityLog />
            </Route>
            {#if authStore.isBotAdmin}
              <Route path="/admin">
                <AdminOverview />
              </Route>
              <Route path="/admin/servers">
                <AdminServers />
              </Route>
              <Route path="/admin/shards">
                <AdminShards />
              </Route>
              <Route path="/admin/security">
                <AdminSecurity />
              </Route>
              <Route path="/admin/content">
                <AdminContent />
              </Route>
              <Route path="/admin/config">
                <AdminConfig />
              </Route>
              <Route path="/admin/activation">
                <AdminActivation />
              </Route>
              <Route path="/admin/modules">
                <AdminModules />
              </Route>
            {/if}
            <Route path="/logs">
              <Logs />
            </Route>
            <Route path="/sanctions">
              <Sanctions />
            </Route>
            <Route path="/detections">
              <Detections />
            </Route>
            <Route path="/regulation">
              <Regulation />
            </Route>
            <Route path="/news">
              <News />
            </Route>
            <Route path="/social-networks">
              <SocialNetworks />
            </Route>
            <Route path="/profile">
              <Profile />
            </Route>
            <Route path="/profile/:userId" let:meta>
              <Profile userId={meta.params.userId} />
            </Route>
            {#if canManageSettings}
              <Route path="/modules">
                <ModuleCatalog />
              </Route>
              <Route path="/module-settings/:moduleId" let:meta>
                <!-- Simple redirect logic for legacy URLs -->
                {@render handleLegacyRedirect(meta.params.moduleId)}
              </Route>
              <Route path="/notifications">
                <NotificationsSettings />
              </Route>
              <Route path="/command-access">
                <CommandAccess />
              </Route>
              <Route path="/settings">
                <GeneralSettings />
              </Route>
              <Route path="/backups">
                <Backups />
              </Route>
              <Route path="/schedules">
                <Schedules />
              </Route>
              <Route path="/automations">
                <ModuleCatalog />
              </Route>
              <Route path="/staff-management">
                <StaffManagement />
              </Route>
              <Route path="/channels-management">
                <ChannelsManagement />
              </Route>
            {/if}

            <Route path="/dailyalgo">
              <DailyAlgo />
            </Route>
            <Route path="/members/*">
              <Members />
            </Route>
            <Route path="/recruitment">
              <Recruitment />
            </Route>
            <Route path="/recruitment-forms">
              <RecruitmentForms />
            </Route>
            <Route path="/recruitment-forms/builder/new">
              <FormBuilder formId={null} />
            </Route>
            <Route path="/recruitment-forms/builder/:formId" let:meta>
              <FormBuilder formId={meta.params.formId} />
            </Route>
            <Route path="/recruitment-forms/:formId/responses" let:meta>
              <FormResponses formId={meta.params.formId} />
            </Route>
            <Route path="/forms">
              <CustomForms />
            </Route>
            <Route path="/forms/builder/new">
              <FormBuilder formId={null} />
            </Route>
            <Route path="/forms/builder/:formId" let:meta>
              <FormBuilder formId={meta.params.formId} />
            </Route>
            <Route path="/forms/:formId/responses" let:meta>
              <CustomFormResponses formId={meta.params.formId} />
            </Route>
            <Route path="/tickets">
              <Tickets />
            </Route>
            <Route path="/meetings">
              <div use:navigate={"/planning"}></div>
            </Route>
            <Route path="/absences">
              <div use:navigate={"/planning"}></div>
            </Route>
            <Route path="/planning">
              <Planning />
            </Route>
            <Route path="/inbox">
              <Inbox />
            </Route>
            <Route path="/tutoring">
              <Tutoring />
            </Route>
            <Route path="/nickname-moderation">
              <NicknameModeration />
            </Route>

            <Route path="/leveling">
              <Leveling />
            </Route>
            <Route path="/economy">
              <Economy />
            </Route>
            <Route path="/giveaways">
              <Giveaways />
            </Route>
            <Route path="/welcome">
              <Announcement />
            </Route>
            <Route path="/announcement">
              <Announcement />
            </Route>
            <Route path="/reaction-roles">
              <ReactionRoles />
            </Route>
            <Route path="/triggers">
              <AutoResponses />
            </Route>
            <Route path="/automod">
              <AutoMod />
            </Route>
            <Route path="/suggestions">
              <Suggestions />
            </Route>
            <Route path="/embed-builder">
              <EmbedBuilder />
            </Route>
            <Route path="/fun">
              <FunSettings />
            </Route>

            <Route path="/double-accounts">
              <DoubleAccounts />
            </Route>
            <Route path="/invitations">
              <Invitations />
            </Route>
            <Route path="/invitations/:code" let:meta>
              {#key meta.params.code}
                <InvitationDetail code={meta.params.code} />
              {/key}
            </Route>

            <Route path="/events">
              <Events />
            </Route>
            <Route path="/events/edit/:eventId" let:meta>
              <EventEditor eventId={meta.params.eventId} />
            </Route>
            <Route path="/events/control/:eventId" let:meta>
              <EventControl eventId={meta.params.eventId} />
            </Route>

            <Route path="/userSettings">
              <UserSettings />
            </Route>

            <!-- Fallback for authenticated users -->
            <Route fallback>
              <NotFound />
            </Route>
          </MainLayout>
        {/if}
      {:else if $router.path !== "/login"}
        <!-- Fallback for unauthenticated users -->
        <Route path="/*">
          <div class="flex items-center justify-center min-h-screen">
            <div
              class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
            ></div>
          </div>
        </Route>
      {/if}
    {/if}

    {#snippet failed(error)}
      <GlobalErrorOverlay
        errorMsg={error instanceof Error ? error.message : String(error)}
        errorStack={error instanceof Error ? error.stack : undefined}
      />
    {/snippet}
  </svelte:boundary>
{/if}

<ToastContainer />
<InviteDetailsModal />
<FeedbackModal />
<CommandPalette />
<KeyboardShortcutsModal isOpen={showKeyboardShortcuts} onClose={() => showKeyboardShortcuts = false} />
