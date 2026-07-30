package com.example.telebar.ui.main

import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation3.runtime.NavKey

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
) {
  AndroidView(
    modifier = Modifier.fillMaxSize(),
    factory = { context ->
      val assetLoader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

      WebView(context).apply {
        layoutParams = android.view.ViewGroup.LayoutParams(
          android.view.ViewGroup.LayoutParams.MATCH_PARENT,
          android.view.ViewGroup.LayoutParams.MATCH_PARENT
        )
        
        settings.apply {
          javaScriptEnabled = true
          domStorageEnabled = true
          allowFileAccess = true
          allowContentAccess = true
          databaseEnabled = true
          mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
          mediaPlaybackRequiresUserGesture = false
        }
        
        webViewClient = object : WebViewClient() {
          override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
          ): WebResourceResponse? {
            return assetLoader.shouldInterceptRequest(request.url)
          }
        }

        webChromeClient = object : WebChromeClient() {
          override fun onPermissionRequest(request: PermissionRequest) {
            request.grant(request.resources)
          }
        }
        
        // Serve local assets securely under HTTPS scheme to prevent ES Modules / CORS loading failures
        loadUrl("https://appassets.androidplatform.net/assets/dist/index.html")
      }
    }
  )
}
