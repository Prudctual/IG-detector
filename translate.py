import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

replacements = {
    'lang="en" dir="ltr"': 'lang="ar" dir="rtl"',
    'family=Inter:wght@300;400;500;600': 'family=Cairo:wght@300;400;500;600;700',
    'Live connection test': 'اختبار الاتصال المباشر',
    'Start scan': 'بدء الفحص',
    'Speed Test': 'مقياس السرعة',
    'Global Network': 'الشبكة العالمية',
    'Speed test<': 'اختبار السرعة<',
    'Help<': 'مساعدة<',
    '<span>GO</span>': '<span>ابدأ</span>',
    'Ready<': 'مستعد<',
    'Download Mbps': 'تنزيل (ميجابت/ث)',
    'Upload Mbps': 'رفع (ميجابت/ث)',
    'Ping ms': 'استجابة (ملي ث)',
    'Jitter ms': 'تذبذب (ملي ث)',
    'Speed grade': 'تصنيف السرعة',
    'Test server': 'خادم الاختبار',
    'Your network': 'شبكتك',
    'Connection<': 'الاتصال<',
    'Latency distribution': 'توزيع الاستجابة',
    'Connection details': 'تفاصيل الاتصال',
    'Streaming<': 'البث المباشر<',
    'Gaming<': 'الألعاب<',
    'Upload work': 'رفع الملفات',
    'Stability<': 'الاستقرار<',
    'Infrastructure Verification': 'التحقق من البنية التحتية',
    'Please pin your exact location on the grid to calibrate regional edge servers for a certified report.': 'يرجى تحديد موقعك الدقيق على الخريطة لضبط الخوادم الإقليمية للحصول على تقرير معتمد.',
    'Confirm Network Location': 'تأكيد موقع الشبكة',
    'Test again': 'إعادة الاختبار',
    'Share': 'مشاركة',
    'The Global Standard in Network Testing': 'المعيار العالمي لاختبار الشبكات',
    'Accurate, secure, and lightning-fast connection diagnostics across 8,500+ servers worldwide.': 'تشخيص دقيق، آمن، وسريع للاتصال عبر أكثر من 8,500 خادم حول العالم.',
    'Global Infrastructure': 'بنية تحتية عالمية',
    'Test your latency and throughput against the closest edge nodes for unparalleled accuracy.': 'اختبر الاستجابة وسرعة النقل مقابل أقرب الخوادم للحصول على دقة لا مثيل لها.',
    'Enterprise Security': 'أمان على مستوى المؤسسات',
    'All test connections are end-to-end encrypted. We never share your personal routing details.': 'جميع اتصالات الاختبار مشفرة بالكامل. نحن لا نشارك تفاصيل التوجيه الشخصية الخاصة بك أبداً.',
    'Advanced Metrics': 'مقاييس متقدمة',
    'Measure more than just speed. Get detailed insights into packet loss, jitter, and stream stability.': 'قس أكثر من مجرد السرعة. احصل على رؤى مفصلة حول فقدان الحزم، التذبذب، واستقرار البث.',
    'Tests run today': 'اختبار تم إجراؤه اليوم',
    'Active servers': 'خوادم نشطة',
    'Average latency': 'متوسط الاستجابة',
    'Technical Overview': 'نظرة فنية عامة',
    'How Our Speed Test Works': 'كيف يعمل اختبار السرعة لدينا',
    'Multi-Threaded Download Testing': 'اختبار التنزيل متعدد المسارات',
    'Our engine opens up to 8 concurrent TCP connections to the nearest edge node. By streaming binary payloads via HTTP/3, we bypass local browser bottlenecks to measure your true maximum downstream capacity.': 'يفتح محركنا ما يصل إلى 8 اتصالات TCP متزامنة بأقرب عقدة. عن طريق بث الحمولات الثنائية عبر HTTP/3، نتخطى اختناقات المتصفح المحلي لقياس أقصى سعة تنزيل حقيقية لديك.',
    'Upload Buffer Streaming': 'بث المخزن المؤقت للرفع',
    'To measure upstream throughput, your browser sends dynamically generated random data buffers to our servers. We calculate the packet acknowledgment rate to determine your stable upload speed under sustained load.': 'لقياس سرعة النقل الصاعدة، يرسل متصفحك مخازن بيانات عشوائية تم إنشاؤها ديناميكياً إلى خوادمنا. نحسب معدل إقرار الحزم لتحديد سرعة الرفع المستقرة لديك تحت الحمل المستمر.',
    'Latency & Jitter (Ping)': 'الاستجابة والتذبذب (Ping)',
    'We measure the time it takes for a small packet to travel from your device to our server and back. Jitter represents the variance in this latency, which is critical for gaming and VoIP calls.': 'نقيس الوقت الذي تستغرقه حزمة صغيرة للسفر من جهازك إلى خادمنا والعودة. يمثل التذبذب التباين في هذه الاستجابة، وهو أمر بالغ الأهمية للألعاب ومكالمات الصوت عبر الإنترنت (VoIP).',
    'Server Selection Algorithm': 'خوارزمية اختيار الخادم',
    'Upon initialization, we use BGP routing tables and your public IP subnet to ping the 5 closest regional servers. The server with the lowest initial handshake time is automatically selected for the full test.': 'عند البدء، نستخدم جداول توجيه BGP وشبكة IP الفرعية العامة الخاصة بك لاختبار أقرب 5 خوادم إقليمية. يتم تحديد الخادم الذي يتمتع بأقل وقت مصافحة أولي تلقائياً للاختبار الكامل.',
    'Legal & Compliance': 'القانونية والامتثال',
    'Privacy Policy': 'سياسة الخصوصية',
    'Effective Date: January 1, 2026. We are committed to protecting your personal data in compliance with GDPR and CCPA.': 'تاريخ النفاذ: 1 يناير 2026. نحن ملتزمون بحماية بياناتك الشخصية وفقاً لـ GDPR و CCPA.',
    'Information We Collect': 'المعلومات التي نجمعها',
    'We strictly collect non-identifiable network telemetry required to perform the speed test. This includes your public IP address (used solely for geographic routing), browser user-agent, and connection type (e.g., Wi-Fi, Cellular).': 'نحن نجمع فقط بيانات الشبكة غير القابلة للتحديد والمطلوبة لإجراء اختبار السرعة. يشمل ذلك عنوان IP العام الخاص بك (المستخدم حصرياً للتوجيه الجغرافي)، ووكيل المستخدم للمتصفح، ونوع الاتصال (مثل Wi-Fi، خلوي).',
    'How We Use Your Data': 'كيف نستخدم بياناتك',
    'Your IP address is processed instantly in active memory (RAM) to find the nearest testing server. We do not store your IP address after the session ends. Aggregated, anonymized speed metrics may be used to publish global internet performance reports.': 'تتم معالجة عنوان IP الخاص بك على الفور في الذاكرة النشطة (RAM) للعثور على أقرب خادم اختبار. نحن لا نخزن عنوان IP الخاص بك بعد انتهاء الجلسة. يمكن استخدام مقاييس السرعة المجمعة ومجهولة المصدر لنشر تقارير أداء الإنترنت العالمية.',
    'Cookies & Trackers': 'ملفات تعريف الارتباط والمتتبعات',
    'Speed Test Global relies on essential local storage to remember your server preferences. We do not use third-party advertising cookies, cross-site trackers, or hidden analytics pixels.': 'يعتمد مقياس السرعة العالمي على التخزين المحلي الأساسي لتذكر تفضيلات الخادم الخاصة بك. لا نستخدم ملفات تعريف ارتباط إعلانية لجهات خارجية، أو متتبعات عبر المواقع، أو بكسلات تحليلات مخفية.',
    'Data Retention': 'الاحتفاظ بالبيانات',
    'We operate on a zero-log infrastructure for individual tests. Network metadata is retained for a maximum of 24 hours for security and anti-DDoS purposes before being permanently purged from our edge servers.': 'نحن نعمل على بنية تحتية خالية من السجلات للاختبارات الفردية. يتم الاحتفاظ بالبيانات الوصفية للشبكة لمدة أقصاها 24 ساعة لأغراض الأمان ومكافحة هجمات حجب الخدمة (DDoS) قبل محوها نهائياً من خوادمنا الطرفية.',
    'Terms of Service': 'شروط الخدمة',
    'By accessing or using Speed Test Global, you agree to be bound by these Terms of Service.': 'من خلال الوصول إلى أو استخدام مقياس السرعة العالمي، فإنك توافق على الالتزام بشروط الخدمة هذه.',
    '1. Acceptable Use': '1. الاستخدام المقبول',
    'You may use our service to test the network performance of your personal or corporate devices. Automated scraping, reverse-engineering of our test protocols, or launching volumetric requests (DDoS) against our testing infrastructure is strictly prohibited.': 'يمكنك استخدام خدمتنا لاختبار أداء الشبكة لأجهزتك الشخصية أو الخاصة بالشركة. يحظر تماماً القشط الآلي أو الهندسة العكسية لبروتوكولات الاختبار الخاصة بنا، أو إطلاق طلبات حجمية (DDoS) ضد بنيتنا التحتية للاختبار.',
    '2. Disclaimer of Warranties': '2. إخلاء المسؤولية عن الضمانات',
    'The service is provided on an "AS IS" and "AS AVAILABLE" basis. While we strive for absolute accuracy, environmental factors such as local Wi-Fi interference, ISP throttling, and hardware limitations may affect your results. We make no guarantees regarding the absolute precision of the metrics provided.': 'يتم تقديم الخدمة على أساس "كما هي" و "كما هي متوفرة". بينما نسعى جاهدين لتحقيق الدقة المطلقة، فإن العوامل البيئية مثل تداخل Wi-Fi المحلي أو تقييد مزود خدمة الإنترنت أو قيود الأجهزة قد تؤثر على نتائجك. لا نقدم أي ضمانات فيما يتعلق بالدقة المطلقة للمقاييس المقدمة.',
    '3. Limitation of Liability': '3. حدود المسؤولية',
    'In no event shall Speed Test Global, its directors, employees, or partners be liable for any indirect, incidental, or consequential damages arising from your use of the service or reliance on the test results for business decisions.': 'لا يجوز بأي حال من الأحوال أن يكون مقياس السرعة العالمي أو مديروه أو موظفوه أو شركاؤه مسؤولين عن أي أضرار غير مباشرة أو عرضية أو تبعية تنشأ عن استخدامك للخدمة أو الاعتماد على نتائج الاختبار في قرارات العمل.',
    '4. Governing Law': '4. القانون الحاكم',
    'These Terms shall be governed by and construed in accordance with the laws of the State of California, without regard to its conflict of law provisions.': 'تخضع هذه الشروط وتفسر وفقاً لقوانين ولاية كاليفورنيا، دون النظر إلى أحكام تعارض القوانين.',
    'Get in Touch': 'ابقى على تواصل',
    'Contact & Support': 'التواصل والدعم',
    'Need help understanding your results or want to partner with our network? Reach out to our global team.': 'هل تحتاج إلى مساعدة في فهم نتائجك أو تريد الشراكة مع شبكتنا؟ تواصل مع فريقنا العالمي.',
    'Corporate Headquarters': 'المركز الرئيسي للشركة',
    'Direct Inquiries': 'الاستفسارات المباشرة',
    'Submit a Ticket': 'تقديم تذكرة',
    'Due to high volume, please allow 24-48 hours for a response.': 'نظراً للحجم الكبير، يرجى الانتظار من 24 إلى 48 ساعة للحصول على رد.',
    'Your Name': 'اسمك',
    'Email Address': 'عنوان البريد الإلكتروني',
    'How can we help?': 'كيف يمكننا المساعدة؟',
    'System Maintenance': 'صيانة النظام',
    'Privacy<': 'الخصوصية<',
    'Terms<': 'الشروط<',
    'Contact<': 'التواصل<',
}

for k, v in replacements.items():
    html = html.replace(k, v)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

with open('public/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

css = css.replace('--sans: "Inter",', '--sans: "Cairo", "Inter",')

with open('public/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("Translation applied.")
