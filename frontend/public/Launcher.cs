using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using System.Reflection;

[assembly: AssemblyTitle("Telebar Desktop Client")]
[assembly: AssemblyDescription("Telebar Smart Cashier and Inventory Desktop App")]
[assembly: AssemblyCompany("Telebar OS")]
[assembly: AssemblyProduct("Telebar")]
[assembly: AssemblyCopyright("Copyright Â© 2026 Telebar OS")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace TelebarLauncher
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string url = "http://localhost:5174";
            
            // 1. Self-installation: Copy itself to AppData\Local\Telebar and create Desktop shortcut
            try
            {
                string appDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Telebar");
                if (!Directory.Exists(appDataFolder))
                {
                    Directory.CreateDirectory(appDataFolder);
                }
                
                string currentExePath = System.Reflection.Assembly.GetExecutingAssembly().Location;
                string destExePath = Path.Combine(appDataFolder, "telebar.exe");
                
                // Copy if running from downloads or temporary location
                if (string.Compare(currentExePath, destExePath, true) != 0)
                {
                    File.Copy(currentExePath, destExePath, true);
                }
                
                // Create Desktop Shortcut
                string desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string shortcutPath = Path.Combine(desktopPath, "Telebar.lnk");
                
                if (!File.Exists(shortcutPath))
                {
                    CreateShortcut(shortcutPath, destExePath);
                }
            }
            catch
            {
                // Silent fail for installation, don't block launching
            }

            // 2. Launch the Application in App Mode
            string edgePath = FindEdgePath();
            if (!string.IsNullOrEmpty(edgePath))
            {
                try
                {
                    Process.Start(edgePath, "--app=" + url);
                    return;
                }
                catch { }
            }

            string chromePath = FindChromePath();
            if (!string.IsNullOrEmpty(chromePath))
            {
                try
                {
                    Process.Start(chromePath, "--app=" + url);
                    return;
                }
                catch { }
            }

            try
            {
                Process.Start(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Xatolik: Tizim brauzerini ochib bo'lmadi. " + ex.Message, "Telebar Desktop", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void CreateShortcut(string shortcutPath, string targetPath)
        {
            try
            {
                Type t = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(t);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = Path.GetDirectoryName(targetPath);
                shortcut.Description = "Telebar Desktop Application";
                shortcut.IconLocation = targetPath + ",0"; 
                shortcut.Save();
            }
            catch { }
        }

        static string FindEdgePath()
        {
            string[] paths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            };

            foreach (var path in paths)
            {
                if (File.Exists(path)) return path;
            }
            return null;
        }

        static string FindChromePath()
        {
            string[] paths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe"
            };

            foreach (var path in paths)
            {
                if (File.Exists(path)) return path;
            }
            return null;
        }
    }
}
