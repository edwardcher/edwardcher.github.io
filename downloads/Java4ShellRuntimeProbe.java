import java.util.Base64;
import java.lang.management.ManagementFactory;
import com.sun.management.HotSpotDiagnosticMXBean;

/** Read-only runtime probe. Never submits the CVE's malformed input. */
class Java4ShellRuntimeProbe {
  public static void main(String[] args) {
    System.out.println("PROBE=LIVE_JVM_READ_ONLY");
    System.out.println("JAVA_VERSION=" + System.getProperty("java.version", "unknown"));
    System.out.println("JAVA_VENDOR=" + System.getProperty("java.vendor", "unknown"));
    System.out.println("VM_NAME=" + System.getProperty("java.vm.name", "unknown"));
    System.out.println("OS_ARCH=" + System.getProperty("os.arch", "unknown"));
    try {
      byte[] result = Base64.getDecoder().decode("SGVsbG8=");
      System.out.println("BENIGN_BASE64=" + (new String(result, java.nio.charset.StandardCharsets.US_ASCII).equals("Hello") ? "PASS" : "FAIL"));
    } catch (Throwable e) {
      System.out.println("BENIGN_BASE64=ERROR:" + e.getClass().getSimpleName());
    }
    try {
      HotSpotDiagnosticMXBean bean = ManagementFactory.getPlatformMXBean(HotSpotDiagnosticMXBean.class);
      for (String option : new String[] {"UseBASE64Intrinsics", "UseAVX"}) {
        try {
          System.out.println("FLAG_" + option + "=" + bean.getVMOption(option).getValue());
        } catch (Exception e) {
          System.out.println("FLAG_" + option + "=UNAVAILABLE");
        }
      }
    } catch (Throwable e) {
      System.out.println("FLAGS=UNAVAILABLE");
    }
  }
}
