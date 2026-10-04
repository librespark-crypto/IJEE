# JEE Long-Response Mobile Regression Fixture

This response is intentionally much longer than one phone screen. It contains prose, equations, lists, source code, a wide table, an image, multilingual text, and identifiers with no natural break opportunities. At every viewport width, ordinary reading should remain vertical; only the table, code, and genuinely wide equations may scroll horizontally inside their own regions.

For a mechanics check, take a block of mass $m=2.0\,\mathrm{kg}$ on a rough incline of angle $\theta=30^\circ$, with coefficient of friction $\mu=1/\sqrt{3}$. The normal reaction is $N=mg\cos\theta$, the limiting friction is $f=\mu N$, and the component of gravity along the plane is $mg\sin\theta$. Inline notation should stay in the sentence, including $\vec{F}_{\mathrm{net}}=m\vec{a}$ and $\Delta x=x_f-x_i$. This intentionally wide inline expression must stay inline and scroll locally if necessary: $\left(\frac{a_1+b_1+c_1+d_1+e_1+f_1+g_1+h_1}{x_1+y_1+z_1}+\frac{a_2+b_2+c_2+d_2+e_2+f_2+g_2+h_2}{x_2+y_2+z_2}+\frac{a_3+b_3+c_3+d_3+e_3+f_3+g_3+h_3}{x_3+y_3+z_3}\right)^2$.

A long reference URL must wrap instead of widening the chat: https://example.org/jee/physics/kinematics/projectile-motion/maximum-horizontal-range/derivation/with-air-resistance/and-an-intentionally-long-path-segment-for-mobile-layout-regression-checks/2026/advanced/paper-analysis?subject=mathematics-and-physics&attempt=extremely-long-regression-fixture&explanation=do-not-create-page-level-overflow

The student can read normally in Hindi: किसी प्रश्न को हल करते समय पहले दी गई राशियों और उनकी इकाइयों को पहचानें, फिर उपयुक्त सिद्धांत चुनें। Hinglish explanation: Pehle free-body diagram banao, phir force balance likho; shortcut tabhi use karo jab assumptions clearly satisfy hoti hain. English explanation should wrap in exactly the same available response width, not a wider desktop-like column.

## 1. A long display derivation

For a projectile launched with speed $u$ at angle $\theta$, resolve the initial velocity into horizontal and vertical components, integrate the acceleration, and eliminate time. A display equation that is still readable at phone size should get its own local swipe region only when it is wider than the available response width:

$$
R(\theta)=\frac{u^2\sin(2\theta)}{g},\qquad T=\frac{2u\sin\theta}{g},\qquad H_{\max}=\frac{u^2\sin^2\theta}{2g},\qquad x(t)=u\cos\theta\,t,\qquad y(t)=u\sin\theta\,t-\frac{1}{2}gt^2
$$

Here the maximum range is obtained at $\theta=45^\circ$ only when launch and landing heights are equal and air resistance is neglected. This surrounding explanation should wrap around long words, long URLs, and all generated identifiers without changing the viewport width.

## 2. A deliberately wide equation

\[
\left(\frac{d^2x}{dt^2}+\omega_0^2x+\frac{\gamma}{m}\frac{dx}{dt}\right)^2+\left(\frac{d^2y}{dt^2}+\omega_1^2y+\frac{\eta}{m}\frac{dy}{dt}\right)^2+\left(\frac{d^2z}{dt^2}+\omega_2^2z+\frac{\zeta}{m}\frac{dz}{dt}\right)^2=\left(\frac{F_x}{m}\right)^2+\left(\frac{F_y}{m}\right)^2+\left(\frac{F_z}{m}\right)^2+\left(\frac{qBv}{m}\right)^2+\left(\frac{k_e q_1q_2}{mr^2}\right)^2
\]

The equation above is intentionally too wide for some phones. It is acceptable for this one equation to be horizontally scrollable inside `.math-scroll`; the message, the chat panel, and the page must not scroll sideways.

## 3. Numbered reasoning and nested lists

1. Draw the free-body diagram and choose axes parallel and perpendicular to the incline.
2. Resolve the weight into components.
   1. Perpendicular component: $mg\cos\theta$.
   2. Parallel component: $mg\sin\theta$.
3. Apply Newton's second law with a sign convention fixed before substitution.
4. Check units and limiting cases before accepting the result.

## 4. Bullet-point checks

- **Physics:** dimensions on both sides of an equation must agree.
- **Mathematics:** factor before expanding a high-degree polynomial.
  - A nested unordered list remains indented without escaping the bubble.
  - A second nested item includes this long token: `Electrostatics__PotentialDifference__SuperLongIdentifierForNarrowMobileScreens__DoNotForceAViewportExpansion__JEE2026AdvancedAnalysis`.
- **Chemistry:** distinguish an empirical observation from an idealized model.
- *Italic* and **bold** emphasis must remain distinguishable in the manga paper palette.

> A useful JEE explanation states the assumptions first, shows the governing law, and only then substitutes values. The quote must wrap within its left border even when it contains a long unbroken sequence: QUOTEOVERFLOWCHECK_8b97d4317ac34a8cbb21f89360bbf14aa6c4e98fe31f5d2d8c44f7c09a82c46.

---

## 5. Code block with a long line

```python
from math import cos, radians, sin, sqrt

mass_kg = 2.0
incline_angle_degrees = 30.0
coefficient_of_friction = 1 / sqrt(3)
gravity_m_per_s_squared = 9.81
normal_reaction_newtons = mass_kg * gravity_m_per_s_squared * cos(radians(incline_angle_degrees))
limiting_friction_newtons = coefficient_of_friction * normal_reaction_newtons
very_long_generated_identifier_for_testing_local_code_scrolling_without_resizing_the_chat_or_the_entire_mobile_viewport = mass_kg * gravity_m_per_s_squared * sin(radians(incline_angle_degrees))
print(normal_reaction_newtons, limiting_friction_newtons, very_long_generated_identifier_for_testing_local_code_scrolling_without_resizing_the_chat_or_the_entire_mobile_viewport)
```

The source block preserves spaces, indentation, and monospace alignment. On a phone, swipe inside the block to read a long line; the paragraph after it continues at the normal message width.

## 6. Wide Markdown table

| Case | Subject | Given values | Model assumption | Working equation | Unit check | Result note | Long explanation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Physics | $m=2\,\mathrm{kg}$, $\theta=30^\circ$ | Smooth plane | $a=g\sin\theta$ | $\mathrm{m\,s^{-2}}$ | Positive down-plane | The available width is intentionally exceeded by many descriptive columns. |
| B | Chemistry | $n=0.50\,\mathrm{mol}$ | Ideal gas | $PV=nRT$ | $\mathrm{Pa\,m^3}$ | Convert temperature to kelvin | Long words and URLs inside a cell still wrap inside the local table scroller. |
| C | Mathematics | $x\in\mathbb{R}$ | $a\ne0$ | $ax^2+bx+c=0$ | Dimensionless | Discriminant $\ge0$ for real roots | Nested observations should remain associated with their own table row. |
| D | Hinglish | Pehle diagram banao | Assumption likho | Formula carefully apply karo | SI units | Answer ko cross-check karo | यह cell भी उसी local scroll container में रहेगा और viewport को चौड़ा नहीं करेगा। |

## 7. Image, escaped characters, and extended text

![A JEE study diagram returned by the tutor](https://ijee.vercel.app/images/journey.jpg "Tutor-generated study diagram")

Escaped Markdown characters stay literal where appropriate: \*not emphasis\*, \_not emphasis\_, and `\|` inside code. Special characters are ordinary text: α, β, γ, ∑, ∫, ≤, ≥, ≠, →, ×, ÷, ₹, &, <, >, {x | x ∈ ℝ}. Hindi: ऊर्जा संरक्षण का नियम लागू करें। Hinglish: Answer ko significant figures ke saath report karo, aur sign convention ko बीच में मत बदलो.

The next identifier is deliberately unbroken to prove that generated content cannot force a desktop-width page:

ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789

## 8. Long-response ending

A person should be able to scroll down through every paragraph, heading, list, equation, code sample, table row, and this final note using the browser's normal vertical scroll. A single long answer remains a phone-width conversation; horizontal swipes are limited to the wide equation, table, or code block that actually needs them.
