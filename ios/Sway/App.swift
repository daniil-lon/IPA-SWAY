import AVFoundation
import UIKit
import WebKit

// Sway for iPhone: the site music.academmix.ru in a full-screen WKWebView, with background audio
// and Taptic Engine feedback the web page asks for through window.webkit.messageHandlers.swayHaptic.

private let background = UIColor(red: 9 / 255, green: 11 / 255, blue: 16 / 255, alpha: 1)

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Music keeps playing with the screen locked or the app in the background.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = background
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private static let home = URL(string: "https://music.academmix.ru/")!
    // Must match WKAppBoundDomains in Info.plist.
    private static let appHosts: Set<String> = [
        "music.academmix.ru", "oauth.yandex.ru", "passport.yandex.ru", "id.yandex.ru", "login.yandex.ru",
    ]

    private var webView: WKWebView!
    private let haptics = Haptics()
    private let failure = UIStackView()
    private var loadedOnce = false

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.limitsNavigationsToAppBoundDomains = true
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1 SwayApp/1.0"
        config.userContentController.add(WeakMessageHandler(self), name: "swayHaptic")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        view = webView
        buildFailureView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: Self.home))
    }

    // MARK: Haptics

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "swayHaptic", let kind = message.body as? String else { return }
        haptics.play(kind)
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "about" || scheme == "blob" || scheme == "data" { return decisionHandler(.allow) }
        if scheme == "https", let host = url.host?.lowercased(), Self.appHosts.contains(host) {
            return decisionHandler(.allow)
        }
        // Everything else (other sites, Telegram, mail) opens outside the app.
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if let host = url.host?.lowercased(), url.scheme == "https", Self.appHosts.contains(host) {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadedOnce = true
        failure.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        if !loadedOnce { failure.isHidden = false }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: First launch without a connection

    private func buildFailureView() {
        let title = UILabel()
        title.text = "Нет соединения с Sway"
        title.textColor = .white
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        let hint = UILabel()
        hint.text = "Проверьте интернет и попробуйте ещё раз"
        hint.textColor = UIColor(white: 1, alpha: 0.6)
        hint.font = .systemFont(ofSize: 15)
        hint.numberOfLines = 0
        hint.textAlignment = .center
        let retry = UIButton(type: .system)
        retry.setTitle("Повторить", for: .normal)
        retry.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        retry.setTitleColor(.black, for: .normal)
        retry.backgroundColor = UIColor(red: 1, green: 0.85, blue: 0.2, alpha: 1)
        retry.layer.cornerRadius = 22
        retry.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        retry.addTarget(self, action: #selector(reloadHome), for: .touchUpInside)

        failure.axis = .vertical
        failure.alignment = .center
        failure.spacing = 14
        for item in [title, hint, retry] as [UIView] { failure.addArrangedSubview(item) }
        failure.translatesAutoresizingMaskIntoConstraints = false
        failure.isHidden = true
        view.addSubview(failure)
        NSLayoutConstraint.activate([
            failure.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            failure.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            failure.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            failure.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
    }

    @objc private func reloadHome() {
        haptics.play("play")
        failure.isHidden = true
        webView.load(URLRequest(url: Self.home))
    }
}

// WKUserContentController keeps its handlers alive; the weak hop avoids a retain cycle with the controller.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

// Kinds come from public/haptics.js: short selection ticks for lists and the deck, a soft tap for
// swipes and screens, a firm tap for play, a double tap for «Мне нравится», a strong burst for «Встряхнуть».
final class Haptics {
    private let selection = UISelectionFeedbackGenerator()
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)

    func play(_ kind: String) {
        switch kind {
        case "tick", "selection":
            selection.selectionChanged()
        case "route":
            light.impactOccurred(intensity: 0.6)
        case "swipe":
            soft.impactOccurred(intensity: 0.9)
        case "play":
            medium.impactOccurred(intensity: 0.8)
        case "like":
            rigid.impactOccurred(intensity: 0.9)
            later(0.09) { self.soft.impactOccurred(intensity: 0.7) }
        case "shuffle":
            rigid.impactOccurred(intensity: 0.8)
        case "shake":
            heavy.impactOccurred()
            later(0.1) { self.medium.impactOccurred() }
            later(0.2) { self.light.impactOccurred() }
        default:
            light.impactOccurred()
        }
    }

    private func later(_ seconds: Double, _ work: @escaping () -> Void) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }
}
